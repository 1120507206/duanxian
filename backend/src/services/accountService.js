/**
 * 账户体系：手机号注册 + 密码登录 + 验证码登录。
 *
 * 与设备体系（userService）的分工：
 *   app_users = 设备维度。匿名访客也要能统计渠道、落埋点，所以这块保留。
 *   accounts  = 人的维度。**会员权益挂在账户上**，这样换电脑、清缓存、换浏览器都不丢会员。
 *
 * 权益解析规则（resolveEntitlement）：
 *   1. 带有效会话 token → 用账户的到期时间；
 *   2. 没有 token → 回落到设备的到期时间（兼容老的激活码用户，以及未登录访客）。
 *   取两者中更晚的那个：避免「账户里还有会员，但当前设备记录是旧的」导致权益倒退。
 *
 * 密码存储：scrypt（Node 内置，不用装 bcrypt 那种需要编译的包），
 * 每次用随机盐，比对走 timingSafeEqual。存的是 `salt:hash` 文本。
 *
 * 会话：随机 256-bit token 存库，不用 JWT。单机 SQLite 规模下这样更简单 ——
 * 改密码/封号时能在服务端直接失效，也不存在密钥泄露和轮换问题。
 */
import crypto from 'crypto'
import db from '../db/index.js'
import { getPlan } from '../config/plans.js'
import * as sms from './smsService.js'
import { normalizePhone } from './smsService.js'
import * as logger from '../utils/logger.js'
import * as users from './userService.js'

const DAY_MS = 24 * 60 * 60 * 1000
const SESSION_TTL_MS = 30 * DAY_MS
const SCRYPT_KEYLEN = 64

/** 新人礼：注册即送的会员天数。改这里即可，不要在业务代码里散落 30 这个数字。 */
export const TRIAL_DAYS = 30

/**
 * 认证策略。**这是注册/登录流程的唯一开关**，前端通过 /api/auth/config 读取，不要在页面里硬编码。
 *
 * requireSmsCode 默认 false：注册只要手机号 + 密码。
 * 关掉短信的理由是冷启动 —— 开通短信通道要服务商账号 + 签名报备（多数还要营业执照），
 * 短则一天长则一周，不该让「用户能不能注册」卡在运营资质上。
 *
 * 但要清楚代价，这不是白拿的：
 *   1. 手机号**未经验证**，它只是个用户名，不代表号主本人。所以任何人可以用任意
 *      11 位号码注册，包括别人的号码 —— 真正需要「证明这号是我的」的场景（找回密码、
 *      改绑手机、涉钱操作）都不能靠它。
 *   2. 密码成了唯一凭据，所以注册时**必填**，且没有自助找回的路，
 *      忘了只能走 `npm run member passwd` 由你人工重置。
 *   3. 防薅新人礼只能靠设备/IP 限流（见下面的 TRIAL_*_LIMIT），
 *      而不像验证码那样天然一人一号。
 *
 * 配好短信通道后，把环境变量 REQUIRE_SMS_CODE 设为 1 即恢复验证码注册，
 * 后端逻辑与前端表单会自动切回，代码不用改。
 */
export const AUTH_POLICY = {
  requireSmsCode: String(process.env.REQUIRE_SMS_CODE || '') === '1',
  passwordMin: 8,
  passwordMax: 32,
}

/**
 * 防薅新人礼的两道闸。
 *
 * 设备闸（2 个 / 7 天）：主力。一个浏览器一个设备 ID，正常用户不会在同一台电脑上
 * 注册第三个号 —— 超过这个数基本就是在刷试用期。
 *
 * IP 闸（20 个 / 24 小时）：**只用来挡脚本批量注册，不能设小**。
 * 原因是国内大量真实用户共享出口 IP：小区宽带、公司网络、尤其是 4G/5G ——
 * 运营商 NAT 下一个 IP 后面可能是成千上万个用户。闸门设成 5，第六个真实用户
 * 就领不到 30 天会员了，而他正是你花钱引流来的人，这笔损失比被薅几个试用期大得多。
 * 所以这里宁可松，靠设备闸兜底。
 */
const TRIAL_DEVICE_LIMIT = 2
const TRIAL_IP_LIMIT = 20

export const ACCOUNT_ERRORS = {
  INVALID_PHONE: '手机号格式不正确',
  INVALID_CODE: '验证码不正确或已过期',
  INVALID_PASSWORD: `密码长度需为 ${AUTH_POLICY.passwordMin}-${AUTH_POLICY.passwordMax} 位`,
  PHONE_TAKEN: '该手机号已注册，请直接登录',
  NOT_FOUND: '账号不存在，请先注册',
  WRONG_PASSWORD: '手机号或密码不正确',
  NO_PASSWORD: '该账号未设置密码，请联系客服重置',
  DISABLED: '账号已被停用，请联系客服',
  WEAK_CODE: '验证码不正确',
}

function nowMs() {
  return Date.now()
}

// ---------------------------------------------------------------- 密码

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password, stored) {
  const raw = String(stored || '')
  const [salt, hash] = raw.split(':')
  if (!salt || !hash) return false
  const candidate = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN)
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) return false
  return crypto.timingSafeEqual(candidate, expected)
}

function isValidPassword(password) {
  const value = String(password || '')
  return value.length >= AUTH_POLICY.passwordMin && value.length <= AUTH_POLICY.passwordMax
}

// ---------------------------------------------------------------- 会话

export function createSession({ accountId, deviceId, userAgent = '', ip = '' }) {
  const token = crypto.randomBytes(32).toString('base64url')
  const now = nowMs()
  db.prepare(`
    INSERT INTO sessions (token, account_id, device_id, user_agent, ip, expires_at, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(token, accountId, deviceId || null, String(userAgent).slice(0, 300), String(ip || '').slice(0, 64), now + SESSION_TTL_MS, now, now)
  return token
}

/** 取会话；过期即删。last_seen_at 不每次都写，避免高频接口变成高频写库 */
export function getSession(token) {
  const value = String(token || '').trim()
  if (!value || value.length < 16) return null

  const now = nowMs()
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(value)
  if (!row) return null

  if (row.expires_at <= now) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(value)
    return null
  }

  if (now - row.last_seen_at > 5 * 60 * 1000) {
    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token = ?').run(now, value)
  }

  return row
}

export function revokeSession(token) {
  if (!token) return
  db.prepare('DELETE FROM sessions WHERE token = ?').run(String(token))
}

export function revokeAllSessions(accountId) {
  db.prepare('DELETE FROM sessions WHERE account_id = ?').run(accountId)
}

/** 清理过期会话。会话表是所有请求的必经查询，不能让它无限增长 */
export function purgeExpiredSessions(cutoffMs = Date.now()) {
  return db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(cutoffMs).changes
}

/** 把设备绑到账户上：让匿名时期的渠道归因与埋点能归并到这个人名下 */
function linkDevice(deviceId, accountId, phone) {
  if (!deviceId) return
  const id = users.normalizeDeviceId(deviceId)
  if (!id) return

  users.ensureUser({ deviceId: id })
  db.prepare('UPDATE app_users SET account_id = ?, phone = ? WHERE device_id = ?').run(accountId, phone || null, id)
  users.invalidateStatusCache(id)
}

// ---------------------------------------------------------------- 会员权益

/**
 * 给账户开通/续期会员。
 * 续期语义与激活码一致：**从原到期日往后叠加**，不从今天重算。
 * 这点做错会直接让老用户续费后时长缩水。
 */
export function grantMembership({ accountId, plan, days, source = 'manual' }) {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId)
  if (!account) return { ok: false, error: '账号不存在' }

  let duration = Number(days) || 0
  let planKey = plan
  if (!duration && plan) {
    const config = getPlan(plan)
    if (!config) return { ok: false, error: `未知套餐: ${plan}` }
    duration = config.durationDays
  }
  if (!duration) return { ok: false, error: '缺少套餐或天数' }

  const now = nowMs()
  const base = Math.max(account.membership_expires_at || 0, now)
  const expiresAt = base + duration * DAY_MS

  db.prepare(`
    UPDATE accounts SET membership_plan = ?, membership_expires_at = ?, updated_at = ? WHERE id = ?
  `).run(planKey || account.membership_plan || 'manual', expiresAt, now, accountId)

  logger.info('membership_granted', {
    accountId,
    plan: planKey || account.membership_plan,
    days: duration,
    source,
    expiresAt: new Date(expiresAt).toISOString(),
  })

  return { ok: true, plan: planKey, durationDays: duration, expiresAt, renewed: (account.membership_expires_at || 0) > now }
}

function shouldGrantTrial({ deviceId, ip }) {
  // 一人一手机号只能领一次（由 trial_granted 保证），这里再挡「同设备/同 IP 批量注册薅试用」
  if (deviceId) {
    const id = users.normalizeDeviceId(deviceId)
    if (id) {
      const count = db.prepare(`
        SELECT COUNT(*) AS c FROM accounts WHERE register_device_id = ? AND created_at >= ?
      `).get(id, nowMs() - 7 * DAY_MS).c
      if (count >= TRIAL_DEVICE_LIMIT) return { ok: false, reason: 'device_limit' }
    }
  }

  if (ip) {
    const count = db.prepare(`
      SELECT COUNT(*) AS c FROM accounts WHERE register_ip = ? AND created_at >= ?
    `).get(String(ip), nowMs() - DAY_MS).c
    if (count >= TRIAL_IP_LIMIT) return { ok: false, reason: 'ip_limit' }
  }

  return { ok: true }
}

// ---------------------------------------------------------------- 注册 / 登录

/**
 * 手机号注册，注册成功即送 TRIAL_DAYS 天会员。
 *
 * 两条分支由 AUTH_POLICY.requireSmsCode 决定：
 *   - 关闭（默认）：手机号 + 密码即可注册。**密码必填** —— 没有短信就等于没有第二个凭据，
 *     再允许空密码，这账号第二天就登不上了（也等于谁都能登）。
 *   - 打开：必须先过短信验证码，此时密码可以留空（之后用验证码登录或登录后补设）。
 *
 * @returns {{ ok, token?, account?, trial?, error? }}
 */
export function register({ phone, code, password, deviceId, channel, ip = '', userAgent = '' } = {}) {
  const normalized = normalizePhone(phone)
  if (!normalized) return { ok: false, error: ACCOUNT_ERRORS.INVALID_PHONE }

  if (AUTH_POLICY.requireSmsCode) {
    const verified = sms.verifyCode({ phone: normalized, code, purpose: 'register' })
    if (!verified.ok) return { ok: false, error: verified.error || ACCOUNT_ERRORS.INVALID_CODE }
  }

  if (db.prepare('SELECT id FROM accounts WHERE phone = ?').get(normalized)) {
    return { ok: false, error: ACCOUNT_ERRORS.PHONE_TAKEN }
  }

  if (AUTH_POLICY.requireSmsCode) {
    // 有验证码兜底时密码选填，但要设就得设合规
    if (password !== undefined && String(password || '') !== '' && !isValidPassword(password)) {
      return { ok: false, error: ACCOUNT_ERRORS.INVALID_PASSWORD }
    }
  } else if (!isValidPassword(password)) {
    return { ok: false, error: ACCOUNT_ERRORS.INVALID_PASSWORD }
  }

  const now = nowMs()
  const accountId = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO accounts
        (phone, password_hash, status, channel, register_device_id, register_ip, created_at, updated_at, last_login_at)
      VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?)
    `).run(
      normalized,
      password ? hashPassword(password) : null,
      users.normalizeChannel(channel) || null,
      users.normalizeDeviceId(deviceId) || null,
      String(ip || '').slice(0, 64),
      now, now, now,
    )
    return Number(info.lastInsertRowid)
  })()

  // 新人礼：注册送 30 天。注册本身不该失败在「试用发不出去」上，
  // 所以限流判定只决定送不送，不影响账号创建成功。
  let trial = null
  const gate = shouldGrantTrial({ deviceId, ip })
  if (gate.ok) {
    const granted = grantMembership({ accountId, plan: 'trial', days: TRIAL_DAYS, source: 'register_trial' })
    if (granted.ok) {
      db.prepare('UPDATE accounts SET trial_granted = 1, trial_granted_at = ? WHERE id = ?').run(now, accountId)
      trial = { days: TRIAL_DAYS, expiresAt: granted.expiresAt }
    }
  } else {
    logger.warn('trial_skipped', { accountId, reason: gate.reason, ip })
  }

  linkDevice(deviceId, accountId, normalized)
  const token = createSession({ accountId, deviceId, userAgent, ip })

  logger.info('account_registered', { accountId, phone: normalized.slice(0, 3) + '****' + normalized.slice(7), channel: users.normalizeChannel(channel), trial: Boolean(trial) })

  return { ok: true, token, trial, account: getPublicAccount(accountId) }
}

export function loginWithPassword({ phone, password, deviceId, ip = '', userAgent = '' } = {}) {
  const normalized = normalizePhone(phone)
  if (!normalized) return { ok: false, error: ACCOUNT_ERRORS.INVALID_PHONE }

  const account = db.prepare('SELECT * FROM accounts WHERE phone = ?').get(normalized)
  if (!account) return { ok: false, error: ACCOUNT_ERRORS.NOT_FOUND }
  if (account.status !== 'active') return { ok: false, error: ACCOUNT_ERRORS.DISABLED }
  // 早期验证码注册留下的无密码账号：报「密码不正确」会让用户反复试，
  // 直接告诉他走人工重置，少一轮无效折腾
  if (!account.password_hash) return { ok: false, error: ACCOUNT_ERRORS.NO_PASSWORD }
  if (!verifyPassword(password, account.password_hash)) {
    return { ok: false, error: ACCOUNT_ERRORS.WRONG_PASSWORD }
  }

  return finishLogin({ account, deviceId, ip, userAgent })
}

export function loginWithCode({ phone, code, deviceId, ip = '', userAgent = '' } = {}) {
  const normalized = normalizePhone(phone)
  if (!normalized) return { ok: false, error: ACCOUNT_ERRORS.INVALID_PHONE }

  const account = db.prepare('SELECT * FROM accounts WHERE phone = ?').get(normalized)
  if (!account) return { ok: false, error: ACCOUNT_ERRORS.NOT_FOUND }
  if (account.status !== 'active') return { ok: false, error: ACCOUNT_ERRORS.DISABLED }

  const verified = sms.verifyCode({ phone: normalized, code, purpose: 'login' })
  if (!verified.ok) return { ok: false, error: verified.error || ACCOUNT_ERRORS.INVALID_CODE }

  return finishLogin({ account, deviceId, ip, userAgent })
}

function finishLogin({ account, deviceId, ip, userAgent }) {
  const now = nowMs()
  db.prepare('UPDATE accounts SET last_login_at = ? WHERE id = ?').run(now, account.id)
  linkDevice(deviceId, account.id, account.phone)
  const token = createSession({ accountId: account.id, deviceId, userAgent, ip })
  return { ok: true, token, account: getPublicAccount(account.id) }
}

/** 设置/重设密码（验证码校验过之后调用） */
export function setPassword({ accountId, password }) {
  if (!isValidPassword(password)) return { ok: false, error: ACCOUNT_ERRORS.INVALID_PASSWORD }
  db.prepare('UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(password), nowMs(), accountId)
  revokeAllSessions(accountId)
  return { ok: true }
}

/**
 * 运营侧按手机号重置密码。
 *
 * 存在的唯一理由：关掉短信验证码后，用户没有自助找回密码的路。
 * 一个付了钱的用户因为忘记密码而登不上，是最不该发生的流失 ——
 * 所以必须留一条人工通道（走 CLI，不开放 HTTP 接口，避免变成撞库入口）。
 */
export function resetPasswordByPhone({ phone, password }) {
  const normalized = normalizePhone(phone)
  if (!normalized) return { ok: false, error: ACCOUNT_ERRORS.INVALID_PHONE }

  const account = db.prepare('SELECT * FROM accounts WHERE phone = ?').get(normalized)
  if (!account) return { ok: false, error: ACCOUNT_ERRORS.NOT_FOUND }

  const result = setPassword({ accountId: account.id, password })
  if (!result.ok) return result

  logger.info('password_reset_by_operator', { accountId: account.id, phone: normalized.slice(0, 3) + '****' + normalized.slice(7) })
  return { ok: true, account: getPublicAccount(account.id) }
}

/**
 * 停用 / 启用账号（后台与运营用）。
 *
 * 停用必须连带踢掉全部会话 —— 否则被封的人只要不退出登录，手里的 token
 * 还能继续用满 30 天，"封禁"就成了个摆设。
 */
export function setAccountStatus({ accountId, status }) {
  const next = status === 'disabled' ? 'disabled' : 'active'
  const info = db.prepare('UPDATE accounts SET status = ?, updated_at = ? WHERE id = ?').run(next, nowMs(), accountId)
  if (!info.changes) return { ok: false, error: '账号不存在' }
  if (next === 'disabled') revokeAllSessions(accountId)
  return { ok: true, status: next }
}

// ---------------------------------------------------------------- 查询

export function getAccountById(id) {
  if (!id) return null
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) || null
}

export function getPublicAccount(id) {
  const row = getAccountById(id)
  if (!row) return null
  return buildAccountStatus(row)
}

function buildAccountStatus(row) {
  const now = nowMs()
  const expiresAt = row.membership_expires_at || 0
  const isMember = expiresAt > now
  const planConfig = getPlan(row.membership_plan)
  return {
    id: row.id,
    phone: row.phone,
    phoneMasked: row.phone ? `${row.phone.slice(0, 3)}****${row.phone.slice(7)}` : '',
    nickname: row.nickname || '',
    status: row.status,
    hasPassword: Boolean(row.password_hash),
    trialGranted: Boolean(row.trial_granted),
    plan: isMember ? row.membership_plan : null,
    planName: isMember ? (planConfig?.name || row.membership_plan) : null,
    isMember,
    expiresAt: expiresAt || null,
    daysLeft: isMember ? Math.ceil((expiresAt - now) / DAY_MS) : 0,
    channel: row.channel || '',
    createdAt: row.created_at,
  }
}

/**
 * 权益解析：账户优先，设备兜底，取更晚的到期时间。
 *
 * 为什么要取更晚的而不是直接以账户为准：老用户此前是用激活码在**设备**上开的会员，
 * 升级后他注册了账号，账户里没有记录。如果只看账户，等于把已付费用户的会员抹掉了。
 */
export function resolveEntitlement({ token, deviceId } = {}) {
  const session = token ? getSession(token) : null
  const account = session ? getPublicAccount(session.account_id) : null
  const deviceStatus = deviceId ? users.getStatus(deviceId) : null

  const candidates = []
  if (account?.expiresAt) candidates.push({ source: 'account', expiresAt: account.expiresAt, plan: account.plan })
  if (deviceStatus?.expiresAt) candidates.push({ source: 'device', expiresAt: deviceStatus.expiresAt, plan: deviceStatus.plan })

  const best = candidates.sort((a, b) => b.expiresAt - a.expiresAt)[0] || null
  const now = nowMs()
  const isMember = Boolean(best && best.expiresAt > now)

  return {
    loggedIn: Boolean(account),
    account,
    source: best?.source || 'none',
    isMember,
    plan: isMember ? best.plan : null,
    expiresAt: isMember ? best.expiresAt : null,
    daysLeft: isMember ? Math.ceil((best.expiresAt - now) / DAY_MS) : 0,
    voice: isMember,
  }
}

/** 下发给 /api/ztlive 的权益开关。付费墙砌在语音上：免费看表，付费出声。 */
export function getEntitlements({ token, deviceId } = {}) {
  const resolved = resolveEntitlement({ token, deviceId })
  return {
    voice: resolved.voice,
    isMember: resolved.isMember,
    plan: resolved.plan,
    expiresAt: resolved.expiresAt,
    daysLeft: resolved.daysLeft,
  }
}

/** 激活码核销：登录后优先充到账户上（跨设备生效），未登录才落到设备 */
export function redeemCode({ code, token, deviceId } = {}) {
  const session = token ? getSession(token) : null

  if (session) {
    const account = getAccountById(session.account_id)
    if (!account) return { ok: false, error: '账号不存在' }

    const normalizedCode = String(code || '').trim().toUpperCase().replace(/\s+/g, '')
    const row = db.prepare('SELECT * FROM activation_codes WHERE code = ?').get(normalizedCode)
    if (!row) return { ok: false, error: users.ACTIVATE_ERRORS.NOT_FOUND }
    if (row.status === 'void') return { ok: false, error: users.ACTIVATE_ERRORS.VOID }
    if (row.status === 'used') return { ok: false, error: users.ACTIVATE_ERRORS.USED }

    const granted = grantMembership({ accountId: account.id, plan: row.plan, days: row.duration_days, source: 'activation_code' })
    db.prepare('UPDATE activation_codes SET status = ?, used_by_account = ?, used_by_device = ?, used_at = ? WHERE code = ?')
      .run('used', account.id, users.normalizeDeviceId(deviceId) || null, nowMs(), normalizedCode)

    return { ok: true, ...granted, status: getPublicAccount(account.id) }
  }

  return users.activate({ deviceId, code })
}

export { SESSION_TTL_MS }
