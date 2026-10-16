import { Router } from 'express'
import { recordEvent } from '../services/userService.js'

const router = Router()

/**
 * 埋点上报。
 *
 * 有意做成「永远返回 200」：事件名不在白名单时也回 200，不告诉调用方哪个名字是合法的，
 * 免得有人靠返回码枚举出埋点清单。真正的过滤发生在 recordEvent 内部。
 * 前端也不需要关心结果 —— 埋点失败绝不能影响主流程。
 */
router.post('/', (req, res) => {
  recordEvent(req.body || {})
  return res.json({ ok: true })
})

export default router
