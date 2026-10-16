import { Router } from 'express'
import * as users from '../services/userService.js'
import * as accounts from '../services/accountService.js'
import { getPurchasablePlans } from '../config/plans.js'
import * as logger from '../utils/logger.js'

const router = Router()

/**
 * 激活码尝试限流。
 *
 * 32 个字符表 × 8 位 ≈ 1.1e12 种组合，盲猜不现实；但限流的意义在于
 * 防止有人写脚本持续试探，顺便让「连续输错」这件事在日志里可见。
 */
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 12
const attempts = new Map()

function activateThrottle(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const bucket = attempts.get(key)

  if (!bucket || bucket.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS })
    return next()
  }

  bucket.count += 1
  if (bucket.count > MAX_ATTEMPTS) {
    logger.warn('activate_rate_limited', { ip: key })
    return res.status(429).json({ error: '尝试次数过多，请 10 分钟后再试' })
  }

  return next()
}

setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of attempts.entries()) {
    if (bucket.resetAt <= now) attempts.delete(key)
  }
}, ATTEMPT_WINDOW_MS).unref()

/**
 * 建档 / 心跳。
 * 页面加载时调一次：首次访问自动建档并把渠道码落库（首次归因），之后只更新最后活跃时间。
 * 带 token 时会一并返回账户权益 —— 这样未登录访客和已登录用户走同一个接口拿状态。
 */
router.post('/session', (req, res) => {
  const { deviceId, channel } = req.body || {}
  const user = users.ensureUser({ deviceId, channel, userAgent: req.get('user-agent') })
  if (!user) return res.status(400).json({ error: '设备标识无效，请刷新页面后重试' })

  const resolved = accounts.resolveEntitlement({ token: req.token, deviceId })
  return res.json({ ...resolved, deviceId: users.getStatus(deviceId).deviceId || '' })
})

/** 只读查询会员状态（不建档、不写库），供页面随时刷新权益 */
router.get('/status', (req, res) => {
  return res.json(accounts.resolveEntitlement({ token: req.token, deviceId: req.query.deviceId }))
})

/**
 * 激活码核销。
 * 登录后充到**账户**上（换设备不丢），未登录才落到设备。
 * 成功后直接回带最新状态，前端不用再多请求一次。
 */
router.post('/activate', activateThrottle, (req, res) => {
  const { deviceId, code } = req.body || {}
  const result = accounts.redeemCode({ token: req.token, deviceId, code })
  if (!result.ok) return res.status(400).json({ error: result.error })

  return res.json({
    ok: true,
    plan: result.plan,
    planName: result.planName,
    durationDays: result.durationDays,
    renewed: result.renewed,
    status: accounts.resolveEntitlement({ token: req.token, deviceId }),
  })
})

/**
 * 套餐列表：把定价与时长从后端下发，避免前端硬编码一份、后端再硬编码一份。
 * 前端只做展示，真正的权益以后端 config/plans.js 为准。
 * 只返回可售套餐 —— 新人礼（trial）不出现在收银台。
 */
router.get('/plans', (req, res) => {
  return res.json({ plans: getPurchasablePlans() })
})

export default router
