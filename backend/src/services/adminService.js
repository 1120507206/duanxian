/**
 * 运营后台：管理员鉴权 + 审计日志。
 *
 * 为什么后台要单起一套账号，而不复用前台 accounts：
 *   1. 权限完全不同 —— 后台能重置任意用户密码、改任意用户到期时间，
 *      前台账号体系再健全也不该具备这种能力。
 *   2. 故障隔离 —— 用户会话表每天被高频读写（每 3 秒一次的行情轮询都要查），
 *      后台会话混在里面既增加误删风险，也让审计难以区分「谁登录了什么」。
 *
 * 安全基线（这几条是刻意设计的，不要为了图方便改掉）：
 *   - **没有默认口令**。管理员必须用 `npm run admin init` 显式创建；
 *     首次访问后台看到的是「尚未初始化」，而不是一个 admin/admin 的入口。
 *   - 密码用 scrypt + 随机盐（复用 accountService 的实现），比对走 timingSafeEqual。
 *   - 登录失败按「IP」和「用户名」两个维度各自限流，防撞库。
 *   - 会话 12 小时过期（比前台的 30 天短得多）—— 后台是低频率、高权限的操作，
 *     没必要让它长期有效；改密码会立刻踢掉该管理员的全部会话。
 *   - 每次写操作都落 admin_logs，且**不提供删除/修改日志的接口**。
 */
import crypto from 'crypto'
import db from '../db/index.js'
import { hashPassword, verifyPassword } from './accountService.js'
import * as logger from '../utils/logger.js'

/** 后台会话有效期。短于前台，因为权限高得多 */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000

/** 登录失败限流：15 分钟内 5 次失败即锁定 */
const LOCK_WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 5

export const ADMIN_ERRORS = {
  NOT_INITIALIZED: '后台尚未初始化。请在服务器执行：npm run admin init --username admin --password 你的密码',
  INVALID_CREDENTIAL: '用户名或密码不正确',
  LOCKED: '尝试次数过多，请 15 分钟后再试',
  DISABLED: '该后台账号已被停用',
  INVALID_USERNAME: '用户名需为 3-32 位字母、数字或 _ . - @',
  WEAK_PASSWORD: '密码至少 8 位',
}

/** 动作 → 中文说明。CLI 与后台页面共用同一份，避免两边文案漂移。 */
export const ACTION_LABELS = {
  admin_login: '登录后台',
  admin_login_failed: '登录失败',
  coverage_grant: '赠送会员',
  account_password_reset: '重置用户密码',
  account_status: '修改用户状态',
  order_approve: '核销订单',
  order_reject: '拒绝订单',
  codes_generate: '生成激活码',
  codes_export: '导出激活码',
  code_void: '作废激活码',
  code_rebind: '迁移激活码',
  admin_create: '创建管理员',
}

function nowMs() {
  return Date.now()
}

function clientKey(prefix, value) {
  return `${prefix}:${String(value || '').slice(0, 80)}`
}

// ---------------------------------------------------------------- 限流

/** ip:<ip> / user:<用户名> → { count, resetAt } */
const failures = new Map()

function lockedFor(key) {
  const bucket = failures.get(key)
  if (!bucket) return 0
  if (bucket.resetAt <= nowMs()) {
    failures.delete(key)
    return 0
  }
  if (bucket.count < MAX_FAILURES) return 0
  return bucket.resetAt - nowMs()
}

function recordFailure(key) {
  const now = nowMs()
  const bucket = failures.get(key)
  if (!bucket || bucket.resetAt <= now) {
    failures.set(key, { count: 1, resetAt: now + LOCK_WINDOW_MS })
    return
  }
  bucket.count += 1
}

function clearFailures(key) {
  failures.delete(key)
}

setInterval(() => {
  const now = nowMs()
  for (const [key, bucket] of failures.entries()) {
    if (bucket.resetAt <= now) failures.delete(key)
  }
}, LOCK_WINDOW_MS).unref()

// ---------------------------------------------------------------- 管理员账号

export function hasAdmin() {
  return db.prepare('SELECT COUNT(*) AS c FROM admin_users').get().c > 0
}

export function listAdmins() {
  return db.prepare(`
    SELECT id, username, display_name, status, last_login_at, last_login_ip, created_at
    FROM admin_users ORDER BY id ASC
  `).all().map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    status: row.status,
    lastLoginAt: row.last_login_at,
    lastLoginIp: row.last_login_ip,
    createdAt: row.created_at,
  }))
}

/**
 * 创建管理员；同名则重置密码（这是「忘掉后台密码」的唯一恢复路径）。
 *
 * 重置密码会踢掉该管理员的全部会话 —— 否则旧密码的持有者仍能继续用，
 * 改密码就没意义了。
 */
export function createAdmin({ username, password, displayName = '' } = {}) {
  const name = String(username || '').trim()
  if (!/^[A-Za-z0-9_.@-]{3,32}$/.test(name)) return { ok: false, error: ADMIN_ERRORS.INVALID_USERNAME }

  const pwd = String(password || '')
  if (pwd.length < 8) return { ok: false, error: ADMIN_ERRORS.WEAK_PASSWORD }

  const now = nowMs()
  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(name)

  if (existing) {
    db.prepare('UPDATE admin_users SET password_hash = ?, display_name = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(hashPassword(pwd), String(displayName || name).slice(0, 40), 'active', now, existing.id)
    revokeAllAdminSessions(existing.id)
    logger.info('admin_credentials_reset', { username: name })
    return { ok: true, created: false, id: existing.id, username: name }
  }

  const info = db.prepare(`
    INSERT INTO admin_users (username, password_hash, display_name, status, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?)
  `).run(name, hashPassword(pwd), String(displayName || name).slice(0, 40), now, now)

  logger.info('admin_created', { username: name })
  return { ok: true, created: true, id: Number(info.lastInsertRowid), username: name }
}

export function setAdminStatus({ adminId, status }) {
  const next = status === 'disabled' ? 'disabled' : 'active'
  const info = db.prepare('UPDATE admin_users SET status = ?, updated_at = ? WHERE id = ?').run(next, nowMs(), adminId)
  if (!info.changes) return { ok: false, error: '管理员不存在' }
  if (next === 'disabled') revokeAllAdminSessions(adminId)
  return { ok: true, status: next }
}

// ---------------------------------------------------------------- 会话

export function createAdminSession({ adminId, ip = '', userAgent = '' }) {
  const token = crypto.randomBytes(32).toString('base64url')
  const now = nowMs()
  db.prepare(`
    INSERT INTO admin_sessions (token, admin_id, user_agent, ip, expires_at, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(token, adminId, String(userAgent).slice(0, 300), String(ip || '').slice(0, 64), now + SESSION_TTL_MS, now, now)
  return { token, expiresAt: now + SESSION_TTL_MS }
}

export function getAdminSession(token) {
  const value = String(token || '').trim()
  if (!value || value.length < 16) return null

  const now = nowMs()
  const row = db.prepare(`
    SELECT s.*, u.username, u.display_name, u.status AS admin_status
    FROM admin_sessions s
    JOIN admin_users u ON u.id = s.admin_id
    WHERE s.token = ?
  `).get(value)
  if (!row) return null

  // 账号被停用 → 连带所有会话作废，不用等管理员手动去踢
  if (row.expires_at <= now || row.admin_status !== 'active') {
    db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(value)
    return null
  }

  if (now - row.last_seen_at > 5 * 60 * 1000) {
    db.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE token = ?').run(now, value)
  }

  return {
    token: value,
    adminId: row.admin_id,
    expiresAt: row.expires_at,
    admin: {
      id: row.admin_id,
      username: row.username,
      displayName: row.display_name || row.username,
    },
  }
}

export function revokeAdminSession(token) {
  if (!token) return
  db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(String(token))
}

export function revokeAllAdminSessions(adminId) {
  db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?').run(adminId)
}

export function purgeExpiredAdminSessions() {
  return db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(nowMs()).changes
}

/**
 * 登录。
 * 不区分「用户名不存在」和「密码错误」，一律回同一句 —— 否则这个接口就成了
 * 枚举管理员用户名的工具。
 */
export function login({ username, password, ip = '', userAgent = '' } = {}) {
  if (!hasAdmin()) {
    return { ok: false, error: ADMIN_ERRORS.NOT_INITIALIZED, code: 'ADMIN_NOT_INITIALIZED' }
  }

  const name = String(username || '').trim()
  const ipKey = clientKey('ip', ip || 'unknown')
  const userKey = clientKey('user', name)

  const ipLock = lockedFor(ipKey)
  const userLock = lockedFor(userKey)
  if (ipLock || userLock) {
    logger.warn('admin_login_locked', { username: name, ip })
    return { ok: false, error: ADMIN_ERRORS.LOCKED, code: 'ADMIN_LOCKED', retryAfterMs: Math.max(ipLock, userLock) }
  }

  const row = name ? db.prepare('SELECT * FROM admin_users WHERE username = ?').get(name) : null
  const passwordOk = row ? verifyPassword(password, row.password_hash) : false

  if (!row || !passwordOk) {
    recordFailure(ipKey)
    recordFailure(userKey)
    logger.warn('admin_login_failed', { username: name, ip })
    return { ok: false, error: ADMIN_ERRORS.INVALID_CREDENTIAL, code: 'ADMIN_BAD_CREDENTIAL' }
  }

  if (row.status !== 'active') {
    return { ok: false, error: ADMIN_ERRORS.DISABLED, code: 'ADMIN_DISABLED' }
  }

  clearFailures(ipKey)
  clearFailures(userKey)

  const session = createAdminSession({ adminId: row.id, ip, userAgent })
  db.prepare('UPDATE admin_users SET last_login_at = ?, last_login_ip = ? WHERE id = ?')
    .run(nowMs(), String(ip || '').slice(0, 64), row.id)

  logAction({
    admin: { id: row.id, username: row.username },
    action: 'admin_login',
    targetType: 'admin',
    targetId: row.username,
    ip,
  })

  return {
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    admin: { id: row.id, username: row.username, displayName: row.display_name || row.username },
  }
}

// ---------------------------------------------------------------- 审计日志

export function logAction({ admin, action, targetType = '', targetId = '', detail = null, ip = '' } = {}) {
  let detailText = null
  if (detail && typeof detail === 'object') {
    try {
      detailText = JSON.stringify(detail).slice(0, 1000)
    } catch (_) {
      detailText = null
    }
  } else if (detail != null) {
    detailText = String(detail).slice(0, 1000)
  }

  db.prepare(`
    INSERT INTO admin_logs (admin_id, admin_name, action, target_type, target_id, detail, ip, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    admin?.id || null,
    String(admin?.username || '(未知)').slice(0, 40),
    String(action).slice(0, 40),
    String(targetType || '').slice(0, 24) || null,
    String(targetId || '').slice(0, 64) || null,
    detailText,
    String(ip || '').slice(0, 64),
    nowMs(),
  )

  logger.info('admin_action', { admin: admin?.username, action, targetType, targetId })
}

/** 审计日志列表（只读，后台与 CLI 共用） */
export function listLogs({ page = 1, pageSize = 30, action = '', keyword = '' } = {}) {
  const size = Math.min(Math.max(Number(pageSize) || 30, 1), 200)
  const current = Math.max(Number(page) || 1, 1)

  const where = []
  const params = []
  if (action) {
    where.push('action = ?')
    params.push(String(action))
  }
  if (keyword) {
    where.push('(admin_name LIKE ? OR target_id LIKE ? OR detail LIKE ?)')
    const like = `%${String(keyword).slice(0, 40)}%`
    params.push(like, like, like)
  }
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = db.prepare(`SELECT COUNT(*) AS c FROM admin_logs ${sql}`).get(...params).c
  const rows = db.prepare(`
    SELECT * FROM admin_logs ${sql}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, size, (current - 1) * size)

  return {
    total,
    page: current,
    pageSize: size,
    items: rows.map((row) => ({
      id: row.id,
      adminName: row.admin_name,
      action: row.action,
      actionText: ACTION_LABELS[row.action] || row.action,
      targetType: row.target_type || '',
      targetId: row.target_id || '',
      detail: row.detail || '',
      ip: row.ip || '',
      createdAt: row.created_at,
    })),
  }
}

export { SESSION_TTL_MS }
