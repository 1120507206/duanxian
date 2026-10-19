import { Router } from 'express'
import * as accounts from '../services/accountService.js'
import * as sms from '../services/smsService.js'
import * as users from '../services/userService.js'
import { TRIAL_DAYS, AUTH_POLICY } from '../services/accountService.js'
import { requireAuth } from '../middleware/session.js'
import { getPurchasablePlans } from '../config/plans.js'
import { listPayMethods, PAY_CONTACT } from '../config/pay.js'
import { asyncHandler } from '../utils/asyncHandler.js'

const router = Router()

/**
 * 认证接口。
 * 所有响应里的 `phone` 都是脱敏后的（138****8000），
 * 原始手机号只在库里，不下发 —— 前端展示用不到全号，少一处泄露就少一处风险。
 */

function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').replace('::ffff:', '')
}

function sendAuthError(res, result) {
  const status = result.code === 'LOGIN_LOCKED' ? 429 : 400
  return res.status(status).json({
    error: result.error,
    code: result.code,
    retryAfterMs: result.retryAfterMs,
  })
}

/**
 * 发送验证码：purpose=register|login。
 *
 * 当前注册走「手机号 + 密码」，不需要验证码，所以这里直接关掉 ——
 * 留着它只会白烧短信费（真实驱动下每条几分钱），也让用户以为有验证码这条路。
 * 配好通道、把 REQUIRE_SMS_CODE 设成 1 之后，这个接口自动恢复。
 */
router.post('/sms/send', asyncHandler(async (req, res) => {
  if (!AUTH_POLICY.requireSmsCode) {
    return res.status(400).json({ error: '当前无需验证码，请直接使用手机号和密码' })
  }

  const { phone, purpose } = req.body || {}
  const target = String(purpose || '').trim() === 'login' ? 'login' : 'register'

  const result = await sms.sendCode({ phone, purpose: target, ip: clientIp(req) })
  if (!result.ok) return sendAuthError(res, result)

  return res.json({
    ok: true,
    sent: true,
    purpose: target,
    // 只有 console 驱动 + SMS_DEBUG=1 才会带上，方便本地联调；
    // 生产换了真实驱动后这里恒为空。
    debugCode: result.debugCode || undefined,
  })
}))

/** 注册：当前为手机号 + 密码（验证码按 AUTH_POLICY 决定是否必需），成功即送 TRIAL_DAYS 天会员 */
router.post('/register', asyncHandler(async (req, res) => {
  const { phone, code, password, deviceId, channel } = req.body || {}

  const result = accounts.register({
    phone,
    code,
    password,
    deviceId,
    channel,
    ip: clientIp(req),
    userAgent: req.get('user-agent'),
  })

  if (!result.ok) return sendAuthError(res, result)

  users.recordEvent({
    deviceId,
    event: 'register',
    channel,
    path: '/register',
    accountId: result.account?.id,
  })

  return res.json({
    ok: true,
    token: result.token,
    account: result.account,
    trial: result.trial ? { days: TRIAL_DAYS, expiresAt: result.trial.expiresAt } : null,
    message: result.trial ? `注册成功，已赠送 ${TRIAL_DAYS} 天会员` : '注册成功',
  })
}))

/** 密码登录 */
router.post('/login', asyncHandler(async (req, res) => {
  const { phone, password, deviceId } = req.body || {}
  const result = accounts.loginWithPassword({
    phone,
    password,
    deviceId,
    ip: clientIp(req),
    userAgent: req.get('user-agent'),
  })

  if (!result.ok) return sendAuthError(res, result)

  users.recordEvent({ deviceId, event: 'login', path: '/login', accountId: result.account?.id })
  return res.json({ ok: true, token: result.token, account: result.account })
}))

/** 验证码登录：仅在开启短信验证码时可用（否则验证码根本发不出去） */
router.post('/login/code', asyncHandler(async (req, res) => {
  if (!AUTH_POLICY.requireSmsCode) {
    return res.status(400).json({ error: '当前使用密码登录，忘记密码请联系客服重置' })
  }

  const { phone, code, deviceId } = req.body || {}
  const result = accounts.loginWithCode({
    phone,
    code,
    deviceId,
    ip: clientIp(req),
    userAgent: req.get('user-agent'),
  })

  if (!result.ok) return sendAuthError(res, result)

  users.recordEvent({ deviceId, event: 'login', path: '/login', accountId: result.account?.id })
  return res.json({ ok: true, token: result.token, account: result.account })
}))

/** 退出登录：只销毁当前会话，其他设备不受影响 */
router.post('/logout', (req, res) => {
  accounts.revokeSession(req.token)
  return res.json({ ok: true })
})

/** 当前登录状态与会员权益；未登录也返回 200（前端靠 loggedIn 判断，不靠状态码） */
router.get('/me', (req, res) => {
  const resolved = accounts.resolveEntitlement({ token: req.token, deviceId: req.query.deviceId })
  return res.json({
    loggedIn: resolved.loggedIn,
    account: resolved.account,
    entitlement: {
      isMember: resolved.isMember,
      plan: resolved.plan,
      expiresAt: resolved.expiresAt,
      daysLeft: resolved.daysLeft,
      voice: resolved.voice,
      source: resolved.source,
    },
  })
})

/** 设置密码（已登录状态下补设，方便之后用密码登录） */
router.post('/password', requireAuth, (req, res) => {
  const { currentPassword, password } = req.body || {}
  const result = accounts.changePassword({
    accountId: req.accountId,
    currentPassword,
    password,
  })
  if (!result.ok) return res.status(400).json({ error: result.error })
  // changePassword 会踢掉所有会话（含当前这个），前端拿到 ok 后应重新登录
  return res.json({ ok: true, relogin: true })
})

/**
 * 前端一次性拿齐的配置：套餐、收款方式、新人礼天数、认证策略。
 * 避免这些常量在前后端各写一份，改价/改注册方式时只改后端。
 *
 * requireSms 是注册表单的开关：前端据此决定「是否显示验证码输入框」。
 * 把它下发而不是让前端自己判断，是为了保证前后端策略永远一致 ——
 * 一旦不一致，用户会填一个后台根本不校验的验证码，或者反过来卡住注册。
 */
router.get('/config', (req, res) => {
  return res.json({
    plans: getPurchasablePlans(),
    payMethods: listPayMethods(),
    trialDays: TRIAL_DAYS,
    contact: PAY_CONTACT,
    requireSms: AUTH_POLICY.requireSmsCode,
    passwordMin: AUTH_POLICY.passwordMin,
    passwordMax: AUTH_POLICY.passwordMax,
    smsReady: sms.describeDriver().ready,
  })
})

/** 会话清理：过期会话定期删，别让表无限长（在 index.js 里定频调用） */
export function purgeSessions() {
  return accounts.purgeExpiredSessions()
}

export default router
