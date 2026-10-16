import { Router } from 'express'
import * as pay from '../services/payService.js'
import { requireAuth } from '../middleware/session.js'
import * as logger from '../utils/logger.js'

const router = Router()

/**
 * 收款码支付。
 *
 * 流程：创建订单 → 展示收款码 + 精确金额 → 用户付款 → 点「我已付款」→
 * 等你核对账单（CLI: npm run member approve）→ 开通会员。
 *
 * 前两个接口需要登录（订单必须归属到账户，否则换设备就对不上账）。
 */

/** 创建订单 */
router.post('/order', requireAuth, (req, res) => {
  const { plan, payMethod, deviceId } = req.body || {}
  const result = pay.createOrder({
    accountId: req.accountId,
    deviceId,
    plan,
    payMethod,
  })

  if (!result.ok) return res.status(400).json({ error: result.error })
  return res.json({ ok: true, order: result.order, qr: result.qr })
})

/** 用户点「我已付款」 */
router.post('/order/:orderNo/confirm', requireAuth, (req, res) => {
  const { payerNote } = req.body || {}
  const result = pay.confirmPayment({
    orderNo: req.params.orderNo,
    payerNote,
    accountId: req.accountId,
  })

  if (!result.ok) return res.status(400).json({ error: result.error })

  if (result.autoApproved) {
    logger.warn('order_auto_approved', { orderNo: req.params.orderNo })
  }

  return res.json({ ok: true, order: result.order, autoApproved: Boolean(result.autoApproved) })
})

/** 查单个订单（付款页轮询状态用，确认开通后自动跳转） */
router.get('/order/:orderNo', requireAuth, (req, res) => {
  const order = pay.getOrder(req.params.orderNo)
  // 越权看别人订单虽然泄露不了什么，但订单号是连续的，顺手挡掉
  if (!order || order.accountId !== req.accountId) {
    return res.status(404).json({ error: '订单不存在' })
  }
  return res.json({ ok: true, order })
})

/** 我的订单列表 */
router.get('/orders', requireAuth, (req, res) => {
  return res.json({ ok: true, orders: pay.listMyOrders(req.accountId) })
})

export default router
