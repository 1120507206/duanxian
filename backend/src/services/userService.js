import crypto from 'crypto'
import db from '../db/index.js'
import { getPlan, isValidPlan } from '../config/plans.js'
import * as logger from '../utils/logger.js'

/**
 * 用户体系：匿名设备 + 激活码。
 *
 * 为什么不做注册登录：
 * 1. 收钱不需要身份 —— 需要的是「能把权益绑到一台设备上」。手机号登录要多接短信服务商、
 *    做签名备案、写隐私政策，最快也要 1-3 天，而 device_id 今天就能上线。
 * 2. 合规更轻 —— 不采集个人信息，就不涉及《个人信息保护法》下的告知同意与备案义务。
 * 3. 体验更快 —— 用户打开就能用，没有注册墙，转化路径短一截。
 *
 * 代价与兜底：换设备 / 清缓存会丢会员。兜底方案是运营侧手动 rebind（见 scripts/member.js），
 * 在日订单几十单的规模下完全够用；等付费用户过千再上微信登录做跨设备。
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** 权益读缓存时长：/api/ztlive 每 3 秒轮询一次，不能每次都打库 */
const ENTITLEMENT_CACHE_TTL_MS = 60 * 1000

/**
 * 激活码字母表：刻意去掉 0/O、1/I/L 这些手输和口播容易混淆的字符。
 * 用户是要在微信里把码发给朋友、或者照着屏幕敲进页面的，可读性比熵值重要。
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const CODE_BLOCK_LEN = 4

/** 允许上报的事件名白名单。不限制的话这个接口会成为写垃圾数据的入口。 */
export const EVENT_WHITELIST = new Set([
  'page_view',
  'ztlive_open',
  'embed_open',
  'voice_on',
  'voice_off',
  'voice_preview',
  'copy_link',
  'pay_click',
  'activate_success',
  'feed_error',
  'register',
  'login',
  'logout',
  'sms_send',
  'order_create',
  'order_confirm',
])

/** deviceId → { plan, expiresAt, channel, cachedAt } */
const statusCache = new Map()

function nowMs() {
  return Date.now()
}

/**
 * 设备 ID 校验：前端生成（推荐 UUID v4），但我们不信任前端。
 * 只允许 URL 安全字符并限制长度，避免被塞进超长字符串或 SQL 特殊内容。
 */
export function normalizeDeviceId(raw) {
  const value = String(raw || '').trim()
  if (!value) return ''
  if (value.length < 8 || value.length > 64) return ''
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return ''
  return value
}

/** 渠道码同样要清洗，它会被写进数据库并在统计里分组 */
export function normalizeChannel(raw) {
  const value = String(raw || '').trim()
  if (!value) return ''
  return value.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '')
}

function randomBlock(len = CODE_BLOCK_LEN) {
  let out = ''
  for (let i = 0; i < len; i += 1) {
    out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]
  }
  return out
}

/** 生成形如 DXY-7K3M-9PQZ 的激活码；前缀只是让运营一眼看出面额，权益一律以库里的 plan 为准 */
function makeCode(planKey) {
  const plan = getPlan(planKey)
  const prefix = plan?.codePrefix || 'DX'
  return `${prefix}-${randomBlock()}-${randomBlock()}`
}

/** 把一行 app_users 转成前端要的状态对象 */
function buildStatus(row) {
  const now = nowMs()
  const expiresAt = row?.expires_at || 0
  const isMember = expiresAt > now
  return {
    deviceId: row?.device_id || '',
    plan: isMember ? row.plan : null,
    planName: isMember ? (getPlan(row.plan)?.name || row.plan) : null,
    isMember,
    expiresAt: expiresAt || null,
    daysLeft: isMember ? Math.ceil((expiresAt - now) / DAY_MS) : 0,
    channel: row?.channel || '',
    firstSeen: row?.created_at || null,
  }
}

/**
 * 建档或更新最后活跃时间。
 * 只在「页面级」接口（/api/user/session）里调用 —— 每 3 秒轮询的权益查询走 getStatus，
 * 是纯读的，否则会变成每 3 秒一次写库。
 */
export function ensureUser({ deviceId, channel, userAgent } = {}) {
  const id = normalizeDeviceId(deviceId)
  if (!id) return null

  const now = nowMs()
  const existing = db.prepare('SELECT * FROM app_users WHERE device_id = ?').get(id)

  if (!existing) {
    db.prepare(`
      INSERT INTO app_users (device_id, plan, expires_at, channel, first_user_agent, created_at, last_seen_at)
      VALUES (?, NULL, NULL, ?, ?, ?, ?)
    `).run(id, normalizeChannel(channel) || null, String(userAgent || '').slice(0, 300), now, now)

    logger.info('user_created', { deviceId: id, channel: normalizeChannel(channel) })
    statusCache.delete(id)
    return db.prepare('SELECT * FROM app_users WHERE device_id = ?').get(id)
  }

  // 渠道码只在首次建档时落库（首次归因）。已有渠道不再被新参数覆盖，
  // 否则多渠道投放到同一个人身上，归因数据会被最后来的那个渠道偷走。
  db.prepare('UPDATE app_users SET last_seen_at = ? WHERE device_id = ?').run(now, id)
  statusCache.delete(id)

  return { ...existing, last_seen_at: now }
}

/**
 * 读会员权益（带 60 秒缓存）。
 *
 * 缓存里存的是 expires_at 而不是 isMember，这样过期判断每次都用当前时间算，
 * 不会出现「缓存了 isMember=true，用户实际已过期却还多放行 60 秒」。
 */
export function getStatus(deviceId) {
  const id = normalizeDeviceId(deviceId)
  if (!id) return buildStatus(null)

  const cached = statusCache.get(id)
  if (cached && nowMs() - cached.cachedAt < ENTITLEMENT_CACHE_TTL_MS) {
    return buildStatus({ ...cached, device_id: id })
  }

  const row = db.prepare('SELECT * FROM app_users WHERE device_id = ?').get(id)
  if (!row) return buildStatus(null)

  statusCache.set(id, {
    plan: row.plan,
    expires_at: row.expires_at,
    channel: row.channel,
    created_at: row.created_at,
    cachedAt: nowMs(),
  })

  return buildStatus(row)
}

/** 下发给 /api/ztlive 的权益开关。付费墙砌在语音上：免费看表，付费出声。 */
export function getEntitlements(deviceId) {
  const status = getStatus(deviceId)
  return {
    voice: status.isMember,
    isMember: status.isMember,
    plan: status.plan,
    expiresAt: status.expiresAt,
    daysLeft: status.daysLeft,
  }
}

/**
 * 批量生成激活码。
 * @returns {{ codes: string[], plan: string, durationDays: number, channel: string, batch: string }}
 */
export function generateCodes({ plan, count = 10, channel = '', batch = '' } = {}) {
  if (!isValidPlan(plan)) throw new Error(`未知套餐: ${plan}`)

  const quantity = Math.min(Math.max(Number(count) || 0, 1), 2000)
  const planConfig = getPlan(plan)
  const channelValue = normalizeChannel(channel) || null
  const batchValue = String(batch || '').slice(0, 32) || `B${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
  const now = nowMs()

  const insert = db.prepare(`
    INSERT INTO activation_codes (code, plan, duration_days, channel, batch, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'unused', ?)
  `)

  const codes = []
  const write = db.transaction(() => {
    while (codes.length < quantity) {
      const code = makeCode(plan)
      if (codes.includes(code)) continue
      try {
        insert.run(code, plan, planConfig.durationDays, channelValue, batchValue, now)
        codes.push(code)
      } catch (error) {
        // 唯一键冲突（概率约 1/1.1e12）直接换一个重试，不中断整批生成
        if (!String(error.message).includes('UNIQUE')) throw error
      }
    }
  })
  write()

  logger.info('codes_generated', { plan, count: codes.length, channel: channelValue, batch: batchValue })
  return { codes, plan, planName: planConfig.name, durationDays: planConfig.durationDays, channel: channelValue || '', batch: batchValue }
}

export const ACTIVATE_ERRORS = {
  INVALID_DEVICE: '设备标识无效，请刷新页面后重试',
  INVALID_CODE: '激活码格式不正确，请核对后重新输入',
  NOT_FOUND: '激活码不存在，请检查是否输错',
  VOID: '该激活码已作废，请联系客服',
  USED: '该激活码已被使用。若你更换了设备，请联系客服处理迁移',
}

/**
 * 核销激活码并开通会员。
 *
 * 续费语义：如果当前会员还没到期，就**从到期日往后叠加**，而不是从今天重新算。
 * 这一点做错会直接导致老用户续费后时长缩水，是最容易踩的坑。
 */
export function activate({ deviceId, code } = {}) {
  const id = normalizeDeviceId(deviceId)
  if (!id) return { ok: false, error: ACTIVATE_ERRORS.INVALID_DEVICE }

  const normalizedCode = String(code || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!/^[A-Z0-9]{2,4}(-[A-Z0-9]{4}){2}$/.test(normalizedCode)) {
    return { ok: false, error: ACTIVATE_ERRORS.INVALID_CODE }
  }

  const now = nowMs()

  const run = db.transaction(() => {
    const row = db.prepare('SELECT * FROM activation_codes WHERE code = ?').get(normalizedCode)
    if (!row) return { ok: false, error: ACTIVATE_ERRORS.NOT_FOUND }
    if (row.status === 'void') return { ok: false, error: ACTIVATE_ERRORS.VOID }
    if (row.status === 'used') return { ok: false, error: ACTIVATE_ERRORS.USED }

    const user = db.prepare('SELECT * FROM app_users WHERE device_id = ?').get(id)
    const currentExpiry = user?.expires_at || 0
    // 未过期就从到期日叠加，已过期则从现在起算
    const base = Math.max(currentExpiry, now)
    const expiresAt = base + row.duration_days * DAY_MS

    if (!user) {
      db.prepare(`
        INSERT INTO app_users (device_id, plan, expires_at, channel, last_code, activation_count, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `).run(id, row.plan, expiresAt, row.channel, normalizedCode, now, now)
    } else {
      db.prepare(`
        UPDATE app_users
        SET plan = ?, expires_at = ?, last_code = ?, activation_count = activation_count + 1, last_seen_at = ?
        WHERE device_id = ?
      `).run(row.plan, expiresAt, normalizedCode, now, id)
    }

    db.prepare(`
      UPDATE activation_codes SET status = 'used', used_by_device = ?, used_at = ? WHERE code = ?
    `).run(id, now, normalizedCode)

    return {
      ok: true,
      plan: row.plan,
      planName: getPlan(row.plan)?.name || row.plan,
      durationDays: row.duration_days,
      expiresAt,
      renewed: currentExpiry > now,
    }
  })

  const result = run()
  statusCache.delete(id)

  if (result.ok) {
    logger.info('code_activated', {
      deviceId: id,
      code: normalizedCode,
      plan: result.plan,
      renewed: result.renewed,
      expiresAt: new Date(result.expiresAt).toISOString(),
    })
  } else {
    logger.warn('code_activate_failed', { deviceId: id, code: normalizedCode, error: result.error })
  }

  return result
}

/**
 * 运营侧把已使用的激活码迁移到新设备（用户换电脑 / 清缓存时的兜底）。
 * 刻意做成只能在服务端手动执行：如果让前端自助迁移，激活码就会变成可共享的，
 * 一个码能开无数台设备，付费墙等于不存在。
 */
export function rebindCode({ code, deviceId, userAgent = '' } = {}) {
  const id = normalizeDeviceId(deviceId)
  const normalizedCode = String(code || '').trim().toUpperCase()
  if (!id || !normalizedCode) return { ok: false, error: '参数不完整' }

  const now = nowMs()
  const run = db.transaction(() => {
    const row = db.prepare('SELECT * FROM activation_codes WHERE code = ?').get(normalizedCode)
    if (!row || row.status !== 'used') return { ok: false, error: '该激活码不是已使用状态，无法迁移' }

    const expiresAt = Math.max(now, (row.used_at || now)) + row.duration_days * DAY_MS
    const existing = db.prepare('SELECT * FROM app_users WHERE device_id = ?').get(id)

    if (!existing) {
      db.prepare(`
        INSERT INTO app_users (device_id, plan, expires_at, channel, last_code, activation_count, first_user_agent, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
      `).run(id, row.plan, expiresAt, row.channel, normalizedCode, String(userAgent).slice(0, 300), now, now)
    } else {
      db.prepare(`
        UPDATE app_users SET plan = ?, expires_at = ?, last_code = ?, last_seen_at = ? WHERE device_id = ?
      `).run(row.plan, expiresAt, normalizedCode, now, id)
    }

    db.prepare('UPDATE activation_codes SET used_by_device = ? WHERE code = ?').run(id, normalizedCode)
    return { ok: true, plan: row.plan, expiresAt, from: row.used_by_device, to: id }
  })

  const result = run()
  statusCache.delete(id)
  if (result.ok) logger.info('code_rebound', result)
  return result
}

/**
 * 作废一个未使用的激活码。
 * 刻意只允许作废 unused 的码：已使用的码一旦作废，等于把用户已付款的权益收回，
 * 那属于退款流程，不能顺手在一个"作废"按钮里做掉。
 */
export function voidCode({ code } = {}) {
  const normalized = String(code || '').trim().toUpperCase()
  if (!normalized) return { ok: false, error: '请提供激活码' }

  const row = db.prepare('SELECT status FROM activation_codes WHERE code = ?').get(normalized)
  if (!row) return { ok: false, error: '激活码不存在' }
  if (row.status === 'used') return { ok: false, error: '该激活码已被使用，无法作废' }
  if (row.status === 'void') return { ok: false, error: '该激活码已经作废过了' }

  db.prepare('UPDATE activation_codes SET status = ? WHERE code = ? AND status = ?').run('void', normalized, 'unused')
  logger.info('code_voided', { code: normalized })
  return { ok: true, code: normalized }
}

/** 账户绑定设备后要立刻失效权益缓存，否则本轮轮询还会拿到旧的（未绑定）状态 */
export function invalidateStatusCache(deviceId) {
  const id = normalizeDeviceId(deviceId)
  if (id) statusCache.delete(id)
}

/** 记录埋点事件；事件名必须在白名单内，meta 只存 JSON 字符串 */
export function recordEvent({ deviceId, event, channel, path, meta, accountId } = {}) {
  if (!EVENT_WHITELIST.has(event)) return false

  const id = normalizeDeviceId(deviceId) || null
  let metaText = null
  if (meta && typeof meta === 'object') {
    try {
      metaText = JSON.stringify(meta).slice(0, 500)
    } catch (_) {
      metaText = null
    }
  }

  db.prepare(`
    INSERT INTO app_events (device_id, event, channel, path, meta, account_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, event, normalizeChannel(channel) || null, String(path || '').slice(0, 120), metaText, accountId || null, nowMs())

  return true
}

/** 运营统计：CLI 的 stats 命令用，也是后续做看板的数据源 */
export function getStats({ sinceDays = 7 } = {}) {
  const since = nowMs() - sinceDays * DAY_MS
  const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM app_users').get().c
  const members = db.prepare('SELECT COUNT(*) AS c FROM app_users WHERE expires_at > ?').get(nowMs()).c
  const everMembers = db.prepare('SELECT COUNT(*) AS c FROM app_users WHERE expires_at IS NOT NULL').get().c

  const codes = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'unused' THEN 1 ELSE 0 END) AS unused,
      SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) AS used,
      SUM(CASE WHEN status = 'void' THEN 1 ELSE 0 END) AS void
    FROM activation_codes
  `).get()

  const byChannel = db.prepare(`
    SELECT COALESCE(NULLIF(channel, ''), '(直接访问)') AS channel, COUNT(*) AS users
    FROM app_users
    GROUP BY channel
    ORDER BY users DESC
    LIMIT 20
  `).all()

  const byEvent = db.prepare(`
    SELECT event, COUNT(*) AS count
    FROM app_events
    WHERE created_at >= ?
    GROUP BY event
    ORDER BY count DESC
  `).all(since)

  const activeDevices = db.prepare(`
    SELECT COUNT(DISTINCT device_id) AS c
    FROM app_events
    WHERE created_at >= ? AND device_id IS NOT NULL
  `).get(since).c

  return {
    sinceDays,
    totalUsers,
    members,
    everMembers,
    activeDevices,
    codes,
    conversionRate: totalUsers ? Number(((everMembers / totalUsers) * 100).toFixed(2)) : 0,
    byChannel,
    byEvent,
  }
}

export { DAY_MS }
