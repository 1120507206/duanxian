import { Router } from 'express'
import config from '../config/index.js'
import * as ztlive from '../services/ztliveService.js'
import * as stream from '../services/ztliveStreamService.js'
import * as socket from '../services/ztliveSocketService.js'
import * as accounts from '../services/accountService.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const deviceId = req.get('x-device-id') || req.query.d || ''
    const token = req.get('x-session-token') || ''
    const data = await ztlive.getZtliveCached()

    // 关键：data 是缓存里的**同一个对象引用**，必须展开成新对象再挂 entitlements。
    // 直接 data.entitlements = ... 会把第一个请求者的权益写进缓存，
    // 结果是「一个人开了会员，所有人都能听语音」，或者反过来。
    return res.json({
      ...data,
      entitlements: accounts.getEntitlements({ token, deviceId }),
    })
  } catch (error) {
    return res.status(503).json({
      error: '涨停播报数据暂时不可用',
      detail: process.env.NODE_ENV === 'production' ? undefined : error.message,
    })
  }
})

/**
 * 实时事件流（SSE）。
 *
 * 身份走 **query 参数**而不是自定义头：浏览器的 EventSource 不支持设置请求头。
 * 这与站内其它接口用 X-Session-Token 头的约定不同，属于 SSE 的硬约束，
 * 所以这里显式兼容两种来源（头 + query），调试时用 curl 也能直接连。
 *
 * 注意：这条流只负责「封板/炸板事件」，全量列表仍然走上面的快照接口。
 * 前端拿不到事件流时（未启用 / 连不上 / 内核不支持）会自动回落成纯轮询，
 * 页面功能不受影响，只是少了「瞬时」这一档。
 */
router.get('/stream', (req, res) => {
  if (!config.ztliveWsEnabled) {
    return res.status(503).json({
      error: '实时事件流未启用',
      code: 'STREAM_DISABLED',
      hint: '设置 ZTLIVE_WS_ENABLED=1 后重启后端即可开启；关闭时页面自动走快照轮询',
    })
  }

  const token = req.get('x-session-token') || String(req.query.token || '')
  const deviceId = req.get('x-device-id') || String(req.query.d || '')

  // 事件流默认对所有人开放（快照本来就是公开行情）。
  // 想把它做成付费墙，把 ZTLIVE_STREAM_REQUIRE_MEMBER 设为 1 即可 ——
  // 门控点只有这一行，不用改前端。
  const entitlements = config.ztliveStreamRequireMember
    ? accounts.getEntitlements({ token, deviceId })
    : null
  const allowEvents = !config.ztliveStreamRequireMember || Boolean(entitlements?.isMember)

  const client = stream.addClient(res, {
    allowEvents,
    // 浏览器断线重连时会自动带上这个头，用它补发断线期间漏掉的封板事件
    lastEventId: req.get('last-event-id') || '',
    meta: {
      hasToken: Boolean(token),
      hasDevice: Boolean(deviceId),
      ip: req.ip,
    },
  })

  if (!client) {
    // 达到并发上限：明确告诉客户端「稍后再试」，别让它以为流已经建立了
    return res.status(503).json({ error: '实时通道繁忙，请稍后重试', code: 'STREAM_BUSY' })
  }

  return undefined
})

/** 事件流自身的健康状态，便于排查「为什么不实时」 */
router.get('/stream/status', (_req, res) => {
  res.json({
    upstream: socket.getHealth(),
    stream: stream.getStats(),
    requireMember: config.ztliveStreamRequireMember,
  })
})

export default router
