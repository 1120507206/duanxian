/**
 * 会话识别。
 *
 * token 从 `X-Session-Token` 头或 `Authorization: Bearer <token>` 里取 ——
 * 前者是自家前端统一用的，后者是为了将来接第三方客户端/调试工具时不用改代码。
 *
 * 刻意**不用** cookie：涨停播报要嵌进通达信的内核浏览器，那类环境对 cookie
 * 的处理很不一致（有的直接禁用），而自定义头是可控的。
 */
import * as accounts from '../services/accountService.js'

export function readToken(req) {
  const raw = req.get('X-Session-Token') || req.get('Authorization') || ''
  const value = String(raw).replace(/^Bearer\s+/i, '').trim()
  return value.length >= 16 ? value : ''
}

export function attachSession(req, _res, next) {
  req.token = readToken(req)
  next()
}

/** 要求已登录；未登录直接 401，路由里就不用到处判断 */
export function requireAuth(req, res, next) {
  if (!req.token) return res.status(401).json({ error: '请先登录', code: 'UNAUTHORIZED' })

  const session = accounts.getSession(req.token)
  if (!session) return res.status(401).json({ error: '登录已失效，请重新登录', code: 'UNAUTHORIZED' })

  req.session = session
  req.accountId = session.account_id
  return next()
}
