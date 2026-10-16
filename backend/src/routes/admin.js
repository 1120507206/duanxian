/**
 * 运营后台接口。
 *
 * 这个文件是原来 `npm run member ...` 那套 CLI 的 HTTP 版本 —— 每条路由都能
 * 对应到一条 CLI 命令：
 *
 *   GET  /overview            ← stats
 *   GET  /accounts            ← （新增）谁注册了
 *   GET  /accounts/:id        ← phone
 *   POST /accounts/:id/grant  ← guser
 *   POST /accounts/:id/password ← passwd
 *   GET  /orders              ← orders
 *   POST /orders/:no/approve  ← approve
 *   POST /orders/:no/reject   ← reject
 *   GET  /codes               ← list
 *   GET  /codes/export        ← export
 *   POST /codes/generate      ← gen
 *   POST /codes/:code/void    ← void
 *   POST /codes/:code/rebind  ← rebind
 *   GET  /logs                ← （新增）审计日志
 *
 * 与 CLI 的关系是**并存**不是替代：服务器上出了问题、连不上数据库客户端时，
 * CLI 仍然是最直接的手段。两边的业务逻辑都落在同一批 service 上，
 * 不存在"后台改了 A、命令行改了 B"的偏差。
 *
 * 一条贯穿全文件的规矩：**所有写操作都要 logAction**。
 * 这个后台能改会员到期时间、能重置任意人密码，没有审计等于没有约束。
 */
import { Router } from 'express'
import * as admin from '../services/adminService.js'
import * as query from '../services/adminQuery.js'
import * as users from '../services/userService.js'
import * as accounts from '../services/accountService.js'
import * as pay from '../services/payService.js'
import { isValidPlan, getPlan } from '../config/plans.js'
import { requireAdmin } from '../middleware/admin.js'
import * as logger from '../utils/logger.js'

const router = Router()

function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').replace('::ffff:', '')
}

/** 把抛出的异常统一转成 400，避免一个前端参数写错就整个 500 */
function safe(handler) {
  return (req, res) => {
    try {
      const result = handler(req, res)
      if (result && typeof result.then === 'function') {
        result.catch((error) => {
          logger.error('admin_route_async_error', { path: req.path, error })
          if (!res.headersSent) res.status(500).json({ error: '操作失败，请查看服务端日志' })
        })
      }
    } catch (error) {
      logger.error('admin_route_error', { path: req.path, error })
      if (!res.headersSent) res.status(400).json({ error: error.message || '操作失败' })
    }
  }
}

// ---------------------------------------------------------------- 登录

/**
 * 后台登录。
 *
 * 状态码是刻意区分的，让前端能给出有用的提示：
 *   503 尚未初始化 → 告诉用户去服务器跑 init 命令
 *   429 被限流      → 告诉他等一会儿，而不是继续试
 *   401 凭据错误    → 不区分用户名 / 密码哪个错
 */
router.post('/login', safe((req, res) => {
  const { username, password } = req.body || {}
  const result = admin.login({
    username,
    password,
    ip: clientIp(req),
    userAgent: req.get('user-agent'),
  })

  if (!result.ok) {
    const status = result.code === 'ADMIN_NOT_INITIALIZED'
      ? 503
      : (result.code === 'ADMIN_LOCKED' ? 429 : 401)
    return res.status(status).json({ ok: false, error: result.error, code: result.code })
  }

  return res.json({ ok: true, token: result.token, admin: result.admin, expiresAt: result.expiresAt })
}))

/** 当前登录的管理员；前端每次进后台用它确认会话还有效 */
router.get('/me', requireAdmin, (req, res) => {
  return res.json({ ok: true, admin: req.admin, expiresAt: req.adminSession.expiresAt })
})

router.post('/logout', requireAdmin, (req, res) => {
  admin.revokeAdminSession(req.adminToken)
  return res.json({ ok: true })
})

// ---------------------------------------------------------------- 概览

router.get('/overview', requireAdmin, safe((req, res) => {
  return res.json(query.getOverview({ days: req.query.days }))
}))

/** 套餐、收款方式、短信驱动等一次性配置，避免后台页面硬编码 */
router.get('/meta', requireAdmin, safe((req, res) => {
  return res.json(query.getMeta())
}))

// ---------------------------------------------------------------- 用户

router.get('/accounts', requireAdmin, safe((req, res) => {
  const { keyword, filter, plan, channel, page, pageSize, sort } = req.query
  return res.json(query.listAccounts({ keyword, filter, plan, channel, page, pageSize, sort }))
}))

router.get('/accounts/:id', requireAdmin, safe((req, res) => {
  const detail = query.getAccountDetail(Number(req.params.id))
  if (!detail) return res.status(404).json({ error: '账号不存在' })
  return res.json(detail)
}))

/**
 * 赠送 / 补偿会员（对应 CLI 的 guser）。
 *
 * 语义与用户自己续费完全一致：**从原到期日往后叠加**，
 * 不是从今天重算 —— 给老用户补 30 天，他的既有会员不该被这笔赠送吃掉。
 */
router.post('/accounts/:id/grant', requireAdmin, safe((req, res) => {
  const accountId = Number(req.params.id)
  const { days, plan, note } = req.body || {}

  const account = accounts.getAccountById(accountId)
  if (!account) return res.status(404).json({ error: '账号不存在' })

  let useDays = Number(days) || 0
  let planKey = null

  if (plan) {
    if (!isValidPlan(plan)) return res.status(400).json({ error: `未知套餐: ${plan}` })
    planKey = String(plan)
    if (!useDays) useDays = getPlan(planKey).durationDays
  }

  if (!useDays) return res.status(400).json({ error: '请指定套餐或天数' })
  if (useDays < 1 || useDays > 3650) return res.status(400).json({ error: '天数需在 1-3650 之间' })

  const result = accounts.grantMembership({ accountId, plan: planKey, days: useDays, source: 'admin_grant' })
  if (!result.ok) return res.status(400).json({ error: result.error })

  admin.logAction({
    admin: req.admin,
    action: 'coverage_grant',
    targetType: 'account',
    targetId: String(accountId),
    detail: { phone: account.phone, days: useDays, plan: planKey || 'manual', note: String(note || '').slice(0, 100) },
    ip: clientIp(req),
  })

  return res.json({
    ok: true,
    days: useDays,
    renewed: result.renewed,
    expiresAt: result.expiresAt,
    account: accounts.getPublicAccount(accountId),
  })
}))

/**
 * 重置用户密码（对应 CLI 的 passwd）。
 *
 * 这是后台里权限最大的一个操作 —— 拿到它等于能接管任意账号。
 * 因此：只允许管理员调用、强制审计、且密码本身绝不进日志。
 */
router.post('/accounts/:id/password', requireAdmin, safe((req, res) => {
  const accountId = Number(req.params.id)
  const { password } = req.body || {}

  const account = accounts.getAccountById(accountId)
  if (!account) return res.status(404).json({ error: '账号不存在' })

  const result = accounts.setPassword({ accountId, password })
  if (!result.ok) return res.status(400).json({ error: result.error })

  admin.logAction({
    admin: req.admin,
    action: 'account_password_reset',
    targetType: 'account',
    targetId: String(accountId),
    // 只记手机号，绝不记密码本身
    detail: { phone: account.phone },
    ip: clientIp(req),
  })

  return res.json({
    ok: true,
    message: '密码已重置。该账号所有登录态已失效，用户需用新密码重新登录',
  })
}))

/** 停用 / 启用账号。停用会连带踢掉该账号所有会话 */
router.post('/accounts/:id/status', requireAdmin, safe((req, res) => {
  const accountId = Number(req.params.id)
  const { status, reason } = req.body || {}

  const account = accounts.getAccountById(accountId)
  if (!account) return res.status(404).json({ error: '账号不存在' })

  const result = accounts.setAccountStatus({ accountId, status })
  if (!result.ok) return res.status(400).json({ error: result.error })

  admin.logAction({
    admin: req.admin,
    action: 'account_status',
    targetType: 'account',
    targetId: String(accountId),
    detail: { phone: account.phone, status: result.status, reason: String(reason || '').slice(0, 100) },
    ip: clientIp(req),
  })

  return res.json({ ok: true, status: result.status, account: accounts.getPublicAccount(accountId) })
}))

// ---------------------------------------------------------------- 订单

router.get('/orders', requireAdmin, safe((req, res) => {
  const { status, keyword, page, pageSize } = req.query
  return res.json(query.listOrders({ status, keyword, page, pageSize }))
}))

/**
 * 核销订单并开通会员（对应 CLI 的 approve）。
 *
 * 这是"钱"的入口：这一步之前的都只是用户自称付了款。
 * 界面上必须让人先对完账单再点，所以前端会二次确认并展示金额与尾数。
 */
router.post('/orders/:orderNo/approve', requireAdmin, safe((req, res) => {
  const orderNo = String(req.params.orderNo || '').toUpperCase()
  const { days, plan, note } = req.body || {}

  if (plan && !isValidPlan(plan)) return res.status(400).json({ error: `未知套餐: ${plan}` })

  const result = pay.approveOrder({
    orderNo,
    by: `admin:${req.admin.username}`,
    days: days ? Number(days) : undefined,
    plan: plan || undefined,
  })
  if (!result.ok) return res.status(400).json({ error: result.error })

  admin.logAction({
    admin: req.admin,
    action: 'order_approve',
    targetType: 'order',
    targetId: orderNo,
    detail: { plan: result.plan, expiresAt: result.expiresAt, note: String(note || '').slice(0, 100) },
    ip: clientIp(req),
  })

  return res.json({
    ok: true,
    orderNo: result.orderNo,
    expiresAt: result.expiresAt,
    account: result.status,
    message: '已核销并开通会员',
  })
}))

router.post('/orders/:orderNo/reject', requireAdmin, safe((req, res) => {
  const orderNo = String(req.params.orderNo || '').toUpperCase()
  const { reason } = req.body || {}

  const result = pay.rejectOrder({
    orderNo,
    by: `admin:${req.admin.username}`,
    reason: String(reason || '未收到款项').slice(0, 200),
  })
  if (!result.ok) return res.status(400).json({ error: result.error })

  admin.logAction({
    admin: req.admin,
    action: 'order_reject',
    targetType: 'order',
    targetId: orderNo,
    detail: { reason: String(reason || '未收到款项').slice(0, 100) },
    ip: clientIp(req),
  })

  return res.json({ ok: true, orderNo: result.orderNo, message: '已拒绝该订单' })
}))

// ---------------------------------------------------------------- 激活码

router.get('/codes', requireAdmin, safe((req, res) => {
  const { status, plan, channel, keyword, page, pageSize } = req.query
  return res.json(query.listCodes({ status, plan, channel, keyword, page, pageSize }))
}))

/** 导出纯码。返回数组而不是直接吐 txt，方便前端同时支持「复制」和「下载」 */
router.get('/codes/export', requireAdmin, safe((req, res) => {
  const { status, plan, channel } = req.query
  const codes = query.exportCodes({ status, plan, channel })
  admin.logAction({
    admin: req.admin,
    action: 'codes_export',
    detail: { count: codes.length, status: status || 'unused', plan: plan || '', channel: channel || '' },
    ip: clientIp(req),
  })
  return res.json({ ok: true, codes, count: codes.length })
}))

router.post('/codes/generate', requireAdmin, safe((req, res) => {
  const { plan, count, channel, batch } = req.body || {}
  if (!isValidPlan(plan)) return res.status(400).json({ error: `未知套餐: ${plan}` })

  const result = users.generateCodes({ plan, count, channel, batch })

  admin.logAction({
    admin: req.admin,
    action: 'codes_generate',
    targetType: 'code',
    targetId: result.batch,
    detail: { plan, count: result.codes.length, channel: result.channel, batch: result.batch },
    ip: clientIp(req),
  })

  return res.json({ ok: true, ...result })
}))

router.post('/codes/:code/void', requireAdmin, safe((req, res) => {
  const code = String(req.params.code || '').toUpperCase()
  const result = users.voidCode({ code })
  if (!result.ok) return res.status(400).json({ error: result.error })

  admin.logAction({
    admin: req.admin,
    action: 'code_void',
    targetType: 'code',
    targetId: code,
    ip: clientIp(req),
  })

  return res.json({ ok: true, code: result.code, message: '激活码已作废' })
}))

/**
 * 把已使用的激活码迁移到新设备（对应 CLI 的 rebind）。
 *
 * 有个容易误解的地方要在响应里说清楚：如果这个码当初是核销到**账号**上的
 * （账户体系下登录后兑换的默认路径），权益本就在账号里，用户换设备只要用
 * 同一个账号登录即可 —— 迁移设备没有意义。所以这里会回带一个提示。
 */
router.post('/codes/:code/rebind', requireAdmin, safe((req, res) => {
  const code = String(req.params.code || '').toUpperCase()
  const { deviceId } = req.body || {}

  const before = query.getCode(code)
  if (!before) return res.status(404).json({ error: '激活码不存在' })

  if (before.usedByAccountId) {
    return res.status(400).json({
      error: `该码已核销到账号 ${before.usedByPhone || `#${before.usedByAccountId}`}，权益在账号上。`
        + '让用户用该账号登录即可，无需迁移设备',
      code: 'CODE_BOUND_TO_ACCOUNT',
    })
  }

  const result = users.rebindCode({ code, deviceId })
  if (!result.ok) return res.status(400).json({ error: result.error })

  admin.logAction({
    admin: req.admin,
    action: 'code_rebind',
    targetType: 'code',
    targetId: code,
    detail: { from: result.from || '', to: result.to },
    ip: clientIp(req),
  })

  return res.json({
    ok: true,
    code,
    from: result.from || '',
    to: result.to,
    expiresAt: result.expiresAt,
    message: `已迁移到 ${result.to}`,
  })
}))

// ---------------------------------------------------------------- 审计日志

router.get('/logs', requireAdmin, safe((req, res) => {
  const { page, pageSize, action, keyword } = req.query
  return res.json(admin.listLogs({ page, pageSize, action, keyword }))
}))

export default router
