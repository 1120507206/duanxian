import * as logger from '../utils/logger.js'

const WINDOW_MS = 60 * 1000
const buckets = new Map()

/**
 * 行情接口前缀。
 *
 * 这些接口是「打开页面就一直轮询」的：涨停播报 3 秒一次，单个标签页就是 20 次/分。
 * 它们必须按「人」计数，不能按 IP —— 小区宽带、公司网络、运营商 NAT 后面
 * 可能是几十个真实用户，共用一个出口 IP。
 */
const MARKET_PREFIXES = [
  '/api/ztlive',
  '/api/home',
  '/api/lianban',
  '/api/longhu',
  '/api/jingjia',
  '/api/zijin',
  '/api/zixuan',
  '/api/fupan',
  '/api/kline',
]

/**
 * 需要严格按 IP 限流的认证写接口。
 *
 * 注意**不包含** `/api/auth/me`：它是页面 bootstrap 时读权益的只读接口，
 * 多开几个标签页就会打几次，跟撞库无关，塞进 60/分的桶只会误伤正常用户。
 */
const STRICT_AUTH_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/login/code',
  '/api/auth/register',
  '/api/auth/sms/send',
  '/api/auth/password',
])

/**
 * 分路由限流。
 *
 * 原来的实现是「所有 /api 共用 240 次/分/IP」。按播报页 20 次/分的节奏，
 * 同一出口 IP 十来个用户就会触发 429；更糟的是 429 会连坐到登录和支付，
 * 用户正在付钱时被拦住，损失的是真实收入。
 *
 * 所以按用途分桶：
 *   · 行情类：按 token / device 计数，额度放宽到 900/分（≈45 个播报标签页）；
 *   · 登录注册、激活码、支付：按 IP 严格计数，保住防撞库 / 防刷单；
 *   · SSE 建连：单独 30/分，挡「断线重连风暴」；
 *   · 其余：保持 240/分。
 *
 * 设备 ID 可以伪造，但行情接口不是攻击面 —— 这里的目标是「别误伤正常用户」，
 * 真正的恶意刷量要靠网关 / WAF，不该让业务代码承担。
 */
const RULES = [
  {
    name: 'stream',
    scope: 'ip',
    max: 30,
    match: (path) => path === '/api/ztlive/stream',
  },
  {
    name: 'market',
    scope: 'client',
    max: 900,
    match: (path) => MARKET_PREFIXES.some((prefix) => path.startsWith(prefix)),
  },
  {
    name: 'auth',
    scope: 'ip',
    max: 60,
    match: (path) => STRICT_AUTH_PATHS.has(path) || path === '/api/user/activate',
  },
  {
    name: 'pay',
    scope: 'ip',
    max: 60,
    match: (path) => path.startsWith('/api/pay'),
  },
  {
    name: 'admin',
    scope: 'ip',
    max: 120,
    match: (path) => path.startsWith('/api/admin'),
  },
]

const DEFAULT_RULE = { name: 'default', scope: 'ip', max: 240 }

/** 供单测使用：给定路径应当命中哪条规则 */
export function rateLimitRuleFor(path) {
  // Express 路由默认大小写不敏感、且容忍尾部斜杠；限流匹配必须用同一口径，
  // 否则 /API/ZTLIVE/stream/ 会绕过 SSE 专用桶，直接落进宽额度的行情桶。
  const normalized = String(path || '').toLowerCase().replace(/\/+$/, '') || '/'
  return RULES.find((rule) => rule.match(normalized)) || DEFAULT_RULE
}

function clientIdentity(req) {
  const token = String(req.get('x-session-token') || req.get('authorization') || '').trim()
  if (token.length >= 16) return `t:${token.slice(0, 96)}`

  const device = String(req.get('x-device-id') || '').trim()
  if (device.length >= 6 && device.length <= 96) return `d:${device}`

  return `i:${req.ip || req.socket?.remoteAddress || 'unknown'}`
}

function bucketKey(rule, req) {
  const identity = rule.scope === 'client'
    ? clientIdentity(req)
    : `i:${req.ip || req.socket?.remoteAddress || 'unknown'}`
  return `${rule.name}|${identity}`
}

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
}

export function rateLimit(req, res, next) {
  const rule = rateLimitRuleFor(req.path)
  const key = bucketKey(rule, req)
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS, rule: rule.name })
    return next()
  }

  bucket.count += 1
  if (bucket.count > rule.max) {
    const retryAfterMs = Math.max(0, bucket.resetAt - now)
    res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)))

    logger.warn('rate_limit_exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      rule: rule.name,
      max: rule.max,
    })

    return res.status(429).json({
      error: '请求过于频繁，请稍后再试',
      code: 'RATE_LIMITED',
      retryAfterMs,
    })
  }

  return next()
}

setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}, WINDOW_MS).unref()
