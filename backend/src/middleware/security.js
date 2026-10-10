const WINDOW_MS = 60 * 1000
const MAX_REQUESTS = 240
const buckets = new Map()
import * as logger from '../utils/logger.js'

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
}

export function rateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return next()
  }

  bucket.count += 1
  if (bucket.count > MAX_REQUESTS) {
    logger.warn('rate_limit_exceeded', {
      ip: key,
      path: req.path,
      method: req.method,
    })
    return res.status(429).json({
      error: '请求过于频繁，请稍后再试',
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
