/**
 * 后台鉴权。
 *
 * 与前台 middleware/session.js 刻意分开：
 *   - 取的是 `X-Admin-Token` 头，不复用 `X-Session-Token` —— 这样即使前台
 *     某个页面出了问题、token 被写坏，也不会顺带影响后台的判定。
 *   - 校验逻辑完全走 admin_sessions 表，用户会话永远换不来后台权限。
 */
import * as admin from '../services/adminService.js'

export function readAdminToken(req) {
  const raw = req.get('X-Admin-Token') || ''
  const value = String(raw).trim()
  return value.length >= 16 ? value : ''
}

export function requireAdmin(req, res, next) {
  const token = readAdminToken(req)
  if (!token) {
    return res.status(401).json({ error: '请先登录后台', code: 'ADMIN_UNAUTHORIZED' })
  }

  const session = admin.getAdminSession(token)
  if (!session) {
    return res.status(401).json({ error: '后台登录已失效，请重新登录', code: 'ADMIN_UNAUTHORIZED' })
  }

  req.adminToken = token
  req.adminSession = session
  req.admin = session.admin
  return next()
}
