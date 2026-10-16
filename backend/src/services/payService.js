/**
 * 付款订单（个人收款码流程）。
 *
 * 状态机：
 *   pending    已下单，还没付款
 *   confirming 用户点了「我已付款」，等你核对账单
 *   paid       已核对并开通会员
 *   rejected   核对不通过（没收到款 / 金额不符）
 *   expired    超时未付款
 *
 * 为什么不自动开通：个人收款码没有回调，'confirming' 只是用户自己说的。
 * 真要自动化，等你接了商户号回调，或者手动开 PAY_AUTO_APPROVE=1。
 *
 * 金额尾数（pay_tag）：同一套餐多笔订单金额完全一样，收款记录里分不清谁是谁。
 * 给每单加 0.01~0.09 的尾数，账单上一眼就能对上。这是个人收款码对账的常用做法。
 */
import crypto from 'crypto'
import db from '../db/index.js'
import { getPlan, isValidPlan, getPurchasablePlans } from '../config/plans.js'
import { getPayMethod, listPayMethods, autoApproveEnabled, ORDER_TTL_MS } from '../config/pay.js'
import * as accounts from './accountService.js'
import * as logger from '../utils/logger.js'

const DAY_MS = 24 * 60 * 60 * 1000

export const ORDER_ERRORS = {
  INVALID_PLAN: '套餐不存在',
  INVALID_METHOD: '收款方式不存在',
  NOT_LOGGED_IN: '请先登录后再下单',
  NOT_FOUND: '订单不存在',
  WRONG_STATE: '订单状态不正确',
  EXPIRED: '订单已过期，请重新下单',
}

function nowMs() {
  return Date.now()
}

/** 订单号：日期 + 随机，人眼可读、口播/打字都不容易错 */
function makeOrderNo() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand = crypto.randomInt(1000, 10000)
  return `DX${date}${rand}`
}

/**
 * 创建订单。
 * @returns {{ ok, order?, qr?, error? }}
 */
export function createOrder({ accountId, deviceId, plan, payMethod = 'wx' } = {}) {
  if (!isValidPlan(plan)) return { ok: false, error: ORDER_ERRORS.INVALID_PLAN }
  const config = getPlan(plan)
  if (config.purchasable === false) return { ok: false, error: ORDER_ERRORS.INVALID_PLAN }
  if (!accountId) return { ok: false, error: ORDER_ERRORS.NOT_LOGGED_IN }

  const method = getPayMethod(payMethod)
  if (!method) return { ok: false, error: ORDER_ERRORS.INVALID_METHOD }

  const now = nowMs()
  // 同一秒内可能撞尾数，取一个当前「未核销订单」里没用到的
  let payTag = crypto.randomInt(1, 10)
  const usedTags = db.prepare(`
    SELECT pay_tag FROM payment_orders
    WHERE status IN ('pending','confirming') AND plan = ?
  `).all(plan).map((row) => row.pay_tag)
  for (let i = 1; i <= 9; i += 1) {
    const candidate = ((payTag + i - 1) % 9) + 1
    if (!usedTags.includes(candidate)) {
      payTag = candidate
      break
    }
  }

  const orderNo = makeOrderNo()
  const amount = Number((config.price + payTag / 100).toFixed(2))

  db.prepare(`
    INSERT INTO payment_orders
      (order_no, account_id, device_id, plan, amount, pay_tag, pay_method, status, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(orderNo, accountId, deviceId || null, plan, amount, payTag, method.key, now, now + ORDER_TTL_MS)

  logger.info('order_created', { orderNo, accountId, plan, amount, payMethod: method.key })

  return {
    ok: true,
    order: getOrder(orderNo),
    qr: {
      url: method.qrUrl,
      methodName: method.name,
      supportNote: method.supportNote,
      payee: method.payee || '',
    },
  }
}

export function getOrder(orderNo) {
  const row = db.prepare('SELECT * FROM payment_orders WHERE order_no = ?').get(String(orderNo || '').trim().toUpperCase())
  if (!row) return null

  const config = getPlan(row.plan)
  const method = getPayMethod(row.pay_method)
  return {
    orderNo: row.order_no,
    accountId: row.account_id,
    plan: row.plan,
    planName: config?.name || row.plan,
    durationDays: config?.durationDays || 0,
    amount: row.amount,
    payTag: row.pay_tag,
    payMethod: row.pay_method,
    payMethodName: method?.name || row.pay_method,
    qrUrl: method?.qrUrl || '',
    supportNote: Boolean(method?.supportNote),
    status: row.status,
    statusText: STATUS_TEXT[row.status] || row.status,
    payerNote: row.payer_note || '',
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    paidAt: row.reviewed_at || null,
  }
}

export const STATUS_TEXT = {
  pending: '等待付款',
  confirming: '待核对',
  paid: '已开通',
  rejected: '未通过',
  expired: '已过期',
}

/** 用户点「我已付款」 */
export function confirmPayment({ orderNo, payerNote = '', accountId } = {}) {
  const row = db.prepare('SELECT * FROM payment_orders WHERE order_no = ?').get(String(orderNo || '').trim().toUpperCase())
  if (!row) return { ok: false, error: ORDER_ERRORS.NOT_FOUND }
  if (row.account_id && accountId && row.account_id !== accountId) {
    return { ok: false, error: ORDER_ERRORS.NOT_FOUND }
  }
  if (row.status !== 'pending') return { ok: false, error: ORDER_ERRORS.WRONG_STATE }
  if (row.expires_at && row.expires_at < nowMs()) {
    db.prepare('UPDATE payment_orders SET status = ? WHERE id = ?').run('expired', row.id)
    return { ok: false, error: ORDER_ERRORS.EXPIRED }
  }

  db.prepare('UPDATE payment_orders SET status = ?, payer_note = ?, confirmed_at = ? WHERE id = ?')
    .run('confirming', String(payerNote).slice(0, 120), nowMs(), row.id)

  logger.info('order_confirmed_by_user', { orderNo: row.order_no, accountId: row.account_id, amount: row.amount })

  // 默认是「等你核对账单」。开 PAY_AUTO_APPROVE=1 才自动开通。
  if (autoApproveEnabled()) {
    const result = approveOrder({ orderNo: row.order_no, by: 'auto' })
    return { ok: true, order: getOrder(row.order_no), autoApproved: result.ok, warning: '自动开通已开启' }
  }

  return { ok: true, order: getOrder(row.order_no), autoApproved: false }
}

/**
 * 核销：确认收到钱，开通会员。
 * 幂等 —— 重复 approve 同一订单不会重复加时长（status 已不是 confirming）。
 */
export function approveOrder({ orderNo, by = 'admin', days, plan } = {}) {
  const row = db.prepare('SELECT * FROM payment_orders WHERE order_no = ?').get(String(orderNo || '').trim().toUpperCase())
  if (!row) return { ok: false, error: ORDER_ERRORS.NOT_FOUND }
  if (row.status === 'paid') return { ok: false, error: '该订单已核销过' }
  if (row.status === 'rejected') return { ok: false, error: '该订单已被拒绝，如需开通请新建订单' }

  const now = nowMs()
  const durationPlan = plan || row.plan

  let granted = { ok: true, expiresAt: (row.account_id ? null : 0) }
  if (row.account_id) {
    granted = accounts.grantMembership({
      accountId: row.account_id,
      plan: durationPlan,
      days: days || undefined,
      source: 'order',
    })
    if (!granted.ok) return granted
  }

  db.prepare('UPDATE payment_orders SET status = ?, reviewed_at = ?, reviewed_by = ?, remark = ? WHERE id = ?')
    .run('paid', now, String(by).slice(0, 40), `order:${row.order_no}`, row.id)

  logger.info('order_approved', { orderNo: row.order_no, accountId: row.account_id, plan: durationPlan, by })

  return {
    ok: true,
    orderNo: row.order_no,
    accountId: row.account_id,
    plan: durationPlan,
    expiresAt: granted.expiresAt,
    status: row.account_id ? accounts.getPublicAccount(row.account_id) : null,
  }
}

export function rejectOrder({ orderNo, by = 'admin', reason = '' } = {}) {
  const row = db.prepare('SELECT * FROM payment_orders WHERE order_no = ?').get(String(orderNo || '').trim().toUpperCase())
  if (!row) return { ok: false, error: ORDER_ERRORS.NOT_FOUND }
  if (row.status === 'paid') return { ok: false, error: '订单已核销，不能拒绝' }

  db.prepare('UPDATE payment_orders SET status = ?, reviewed_at = ?, reviewed_by = ?, remark = ? WHERE id = ?')
    .run('rejected', nowMs(), String(by).slice(0, 40), String(reason).slice(0, 200), row.id)

  logger.info('order_rejected', { orderNo: row.order_no, by, reason })
  return { ok: true, orderNo: row.order_no }
}

/** 我的订单（前端「我的订单」列表用） */
export function listMyOrders(accountId, limit = 20) {
  if (!accountId) return []
  return db.prepare(`
    SELECT * FROM payment_orders WHERE account_id = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(accountId, limit).map((row) => getOrder(row.order_no))
}

/** 待核销订单（运营看板 / CLI 用） */
export function listPendingOrders(limit = 50) {
  return db.prepare(`
    SELECT * FROM payment_orders WHERE status IN ('confirming','pending')
    ORDER BY created_at DESC LIMIT ?
  `).all(limit).map((row) => ({
    ...getOrder(row.order_no),
    accountId: row.account_id,
    phone: row.account_id ? (db.prepare('SELECT phone FROM accounts WHERE id = ?').get(row.account_id)?.phone || '') : '',
  }))
}

/** 超时未付款的订单自动过期，避免列表里堆满废弃单 */
export function expireOrders() {
  const info = db.prepare(`
    UPDATE payment_orders SET status = 'expired'
    WHERE status IN ('pending','confirming') AND expires_at IS NOT NULL AND expires_at < ?
  `).run(nowMs())
  return info.changes
}

export { listPayMethods, getPurchasablePlans, DAY_MS }
