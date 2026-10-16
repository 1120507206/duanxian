import config from '../config/index.js'
import * as logger from '../utils/logger.js'
import * as socket from './ztliveSocketService.js'

/**
 * SSE 事件推送（后端 → 浏览器）。
 *
 * ── 为什么用 SSE 而不是自建 WebSocket ──
 * 这条链路只需要「服务端单向推事件」这一件事，SSE 原生就是这个语义，而且：
 *   · 不需要引入依赖（Express 直接 `res.write` 即可；自建 WS 要装 ws + 处理 upgrade + 代理要开 ws）；
 *   · 浏览器内置自动重连，并且会带上 `Last-Event-ID`，断线补发几乎是白送的；
 *   · 走标准 HTTP，穿透 Nginx / 公司代理 / 通达信内核浏览器都没有额外配置。
 * 唯一的代价是「每个页面占一条长连接」，对这类看盘工具完全可接受。
 *
 * ── 保活 ──
 * 空闲连接会被中间代理按超时掐断（Nginx 默认 60s 无数据即断）。所以每 25 秒发一个
 * SSE 注释行 `: ping` —— 注释不是事件，不会触发前端任何回调，只用来刷新链路活性。
 */

const HEARTBEAT_MS = 25_000

const clients = new Set()
let clientSeq = 0

function write(client, chunk) {
  try {
    client.res.write(chunk)
  } catch (_) {
    // 写失败说明连接已经废了，close 事件会把它摘掉
  }
}

function sendEvent(client, event) {
  if (!client.allowEvents) return
  write(client, `id: ${event.seq}\nevent: ztpool\ndata: ${JSON.stringify(event)}\n\n`)
}

function sendControl(client, name, payload) {
  write(client, `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`)
}

/** 把总线上的事件转发给所有（有权限的）客户端 */
socket.subscribeEvents((event) => {
  for (const client of clients) sendEvent(client, event)
})

/** 上游连接状态变化也透出去，前端能显示「实时通道重连中」而不是假装一切正常 */
socket.subscribeStatus((state) => {
  for (const client of clients) sendControl(client, 'status', state)
})

setInterval(() => {
  if (!clients.size) return
  for (const client of clients) write(client, ': ping\n\n')
}, HEARTBEAT_MS).unref()

function cleanup(client) {
  if (!clients.delete(client)) return
  clearInterval(client.aliveTimer)
  logger.info('ztlive_stream_client_closed', {
    clientId: client.id,
    clients: clients.size,
  })
}

/**
 * 接入一个 SSE 客户端。
 *
 * @param {import('express').Response} res
 * @param {object} options
 * @param {boolean} options.allowEvents 是否下发封板事件（权益门控的开关落点）
 * @param {number|string} options.lastEventId 断线重连时浏览器带回来的最后事件号
 * @param {object} options.meta 打日志用的身份信息（不做鉴权，仅观测）
 */
export function addClient(res, { allowEvents = true, lastEventId = '', meta = {} } = {}) {
  if (clients.size >= config.ztliveStreamMaxClients) {
    logger.warn('ztlive_stream_rejected', { reason: 'max_clients', clients: clients.size })
    return null
  }

  const client = {
    id: `c${++clientSeq}`,
    res,
    allowEvents,
    aliveTimer: null,
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Nginx 专用：不缓冲，否则事件会攒在代理层里成批吐出来，「实时」就没了
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders?.()

  // 告诉浏览器：断线后 3 秒重连（默认也是 3 秒，这里是显式声明，避免被中间层改掉）
  write(client, 'retry: 3000\n\n')

  clients.add(client)

  sendControl(client, 'hello', {
    allowEvents,
    serverTime: Date.now(),
    upstream: socket.getStatus(),
    currentSeq: socket.getStatus().seq,
  })

  // 断线补发：只在浏览器带了 Last-Event-ID 时做。
  // 首次连接绝不能补发 —— 那会把缓冲区里的历史事件当"新事件"重放一遍，
  // 前端会连插一堆行、连念一串播报。
  const replay = socket.getEventsSince(lastEventId)
  if (replay.length) {
    logger.info('ztlive_stream_replay', { clientId: client.id, count: replay.length, from: lastEventId })
    for (const event of replay) sendEvent(client, event)
  }

  res.on('close', () => cleanup(client))
  res.on('error', () => cleanup(client))

  logger.info('ztlive_stream_client_open', {
    clientId: client.id,
    clients: clients.size,
    allowEvents,
    ...meta,
  })

  return client
}

/**
 * 主动断开所有客户端。用于服务端关闭/重启前先收尾，
 * 让浏览器立刻进入重连而不是干等 TCP 超时。
 */
export function closeAll() {
  for (const client of [...clients]) {
    try {
      sendControl(client, 'bye', { reason: 'server_shutdown' })
      client.res.end()
    } catch (_) {
      /* 忽略 */
    }
    cleanup(client)
  }
}

export function getStats() {
  return {
    clients: clients.size,
    allowEventsClients: [...clients].filter((client) => client.allowEvents).length,
  }
}
