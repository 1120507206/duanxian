import { EventEmitter } from 'node:events'
import config from '../config/index.js'
import * as logger from '../utils/logger.js'
import { normalizeEventRow } from './ztliveService.js'

/**
 * 上游封板事件流客户端（方案 B：后端中转）。
 *
 * ── 为什么不让浏览器直连上游 ──
 * 上游 WS 目前不校验 Origin，前端直连也能通。但那样把三方地址、报文格式、重连策略
 * 全散在客户端，对方哪天加白名单或改协议，所有已发出去的版本一起挂。收在后端之后：
 *   ① 前端只有一个网络边界（自己的域名），上游怎么变都在服务端消化；
 *   ② 连接数从「每个标签页一条」收敛成「整个服务一条」，上游压力可控；
 *   ③ 将来要做权益门控 / 报文脱敏，改一处就生效。
 *
 * ── 与快照的关系 ──
 * 这是**事件流**，不是数据源替代品：只推「刚封板 / 刚炸板」的那一只。全量列表、
 * 统计、板块仍然由 ztliveService 的快照轮询负责。两条链路互补，缺一不可。
 */

/** 上游把行情推送统一打上这个关键词，用它先粗筛掉心跳等非行情报文 */
const WS_KEYWORD = 'stocklive'
const HEARTBEAT_MS = 30_000
const RECONNECT_MIN_MS = 2_000
const RECONNECT_MAX_MS = 30_000
/** 最近事件环形缓冲：客户端断线重连时按 Last-Event-ID 补发这一段，避免漏掉封板 */
const BUFFER_SIZE = 200
const BUFFER_TTL_MS = 120_000
/** 上游封板推送是稀疏事件流（几分钟一条很正常），长时间收不到不算故障 */
const SILENT_HEALTHY_MS = 10 * 60_000

const bus = new EventEmitter()
// 订阅方是每个 SSE 连接，可能很多，去掉默认的 10 条上限告警
bus.setMaxListeners(0)

const status = {
  enabled: config.ztliveWsEnabled,
  state: 'idle', // idle | connecting | open | closed
  url: '',
  connectedAt: 0,
  lastEventAt: 0,
  receivedFrames: 0,
  ztpoolEvents: 0,
  reconnects: 0,
  lastError: '',
}

let ws = null
let heartbeatTimer = null
let reconnectTimer = null
let retryCount = 0
let started = false
let seq = 0
const buffer = []

function publicStatus() {
  return {
    enabled: status.enabled,
    state: status.state,
    connectedAt: status.connectedAt,
    lastEventAt: status.lastEventAt,
    ztpoolEvents: status.ztpoolEvents,
    reconnects: status.reconnects,
    seq,
  }
}

function emitStatus() {
  bus.emit('status', publicStatus())
}

function clearTimers() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function scheduleReconnect() {
  if (!started || reconnectTimer) return
  // 指数退避，封顶 30 秒：上游抖一下就疯狂重连会把两边都拖垮
  const delay = Math.min(RECONNECT_MIN_MS * 2 ** Math.min(retryCount, 4), RECONNECT_MAX_MS)
  retryCount += 1
  status.reconnects += 1
  logger.warn('ztlive_ws_reconnect_scheduled', { delayMs: delay, attempt: retryCount })
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}

function pickUrl() {
  // 首个地址失败后先切备用域名试一轮，再回到主地址继续退避
  return retryCount % 2 === 1 ? config.ztliveWsFallbackUrl : config.ztliveWsUrl
}

function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  heartbeatTimer = setInterval(() => {
    try {
      if (ws && ws.readyState === 1) ws.send('ping')
    } catch (_) {
      // 发送失败交给 onclose 走重连，这里不额外处理
    }
  }, HEARTBEAT_MS)
}

/** 上游报文 → 事件对象。非行情 / 非 ztpool 一律丢弃 */
function parseFrame(raw) {
  const text = typeof raw === 'string' ? raw : String(raw ?? '')
  if (!text.includes(WS_KEYWORD)) return null

  let info
  try {
    info = JSON.parse(text)
  } catch (_) {
    return null
  }

  // 上游在同一条连接上跑两个频道：`ztpool` 是封板，`ztyd` 是异动。
  // 这里只关心封板 —— 异动播报是另一条产品线，混进来会把表格搅乱。
  if (info?.from !== 'ztpool') return null

  const row = normalizeEventRow(info)
  if (!row || !/^\d{6}$/.test(row.code)) return null
  return row
}

function publish(row) {
  seq += 1
  const event = { type: 'ztpool', seq, ts: Date.now(), row }

  buffer.push(event)
  if (buffer.length > BUFFER_SIZE) buffer.shift()

  status.lastEventAt = event.ts
  status.ztpoolEvents += 1
  bus.emit('event', event)
}

function connect() {
  if (!started) return
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return
  if (typeof WebSocket === 'undefined') {
    status.state = 'closed'
    status.lastError = 'runtime_without_websocket'
    logger.error('ztlive_ws_unsupported_runtime', {
      hint: '需要 Node 18+（内置 WebSocket）；已自动降级为纯快照轮询',
    })
    return
  }

  const url = pickUrl()
  status.state = 'connecting'
  status.url = url
  emitStatus()

  try {
    ws = new WebSocket(url)
  } catch (error) {
    status.state = 'closed'
    status.lastError = error.message
    logger.warn('ztlive_ws_ctor_failed', { url, message: error.message })
    ws = null
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    retryCount = 0
    status.state = 'open'
    status.connectedAt = Date.now()
    status.lastError = ''
    logger.info('ztlive_ws_open', { url })
    startHeartbeat()
    emitStatus()
  }

  ws.onmessage = (event) => {
    status.receivedFrames += 1
    const row = parseFrame(event?.data)
    if (row) {
      logger.info('ztlive_ws_ztpool', { code: row.code, name: row.name, status: row.status })
      publish(row)
    }
  }

  ws.onerror = () => {
    // 浏览器/undici 的 error 事件都不带原因，真正的信息在随后的 close 里
    status.lastError = 'socket_error'
  }

  ws.onclose = (event) => {
    status.state = 'closed'
    clearTimers()
    ws = null
    emitStatus()
    logger.warn('ztlive_ws_closed', {
      code: event?.code,
      reason: event?.reason,
      connectedForMs: status.connectedAt ? Date.now() - status.connectedAt : 0,
    })
    scheduleReconnect()
  }
}

export function start() {
  if (started) return
  if (!status.enabled) {
    logger.info('ztlive_ws_disabled', { hint: 'ZTLIVE_WS_ENABLED=0，仅走快照轮询' })
    return
  }
  started = true
  logger.info('ztlive_ws_starting', { url: config.ztliveWsUrl })
  connect()
}

export function stop() {
  started = false
  clearTimers()
  if (ws) {
    try {
      ws.onclose = null
      ws.onerror = null
      ws.onmessage = null
      ws.onopen = null
      ws.close()
    } catch (_) {
      /* 忽略：进程退出路径上的关闭失败无需处理 */
    }
    ws = null
  }
  status.state = 'idle'
}

export function getStatus() {
  return publicStatus()
}

/**
 * 取 seq 之后的事件（断线重连补发用）。
 * 只补发 TTL 内的：更早的事件对「实时播报」已经没有价值，补出来反而会连念一串过期的。
 */
export function getEventsSince(lastSeq) {
  const from = Number(lastSeq)
  if (!Number.isFinite(from) || from <= 0) return []
  const floor = Date.now() - BUFFER_TTL_MS
  return buffer.filter((event) => event.seq > from && event.ts >= floor)
}

export function subscribeEvents(listener) {
  bus.on('event', listener)
  return () => bus.off('event', listener)
}

export function subscribeStatus(listener) {
  bus.on('status', listener)
  // 立即推一次当前状态，订阅方不用等下一次变化才知道连没连上
  listener(publicStatus())
  return () => bus.off('status', listener)
}

/** 供健康检查用：状态 + 是否长期静默（静默在非交易时段是正常的，只做观测不做告警） */
export function getHealth() {
  const silentForMs = status.lastEventAt ? Date.now() - status.lastEventAt : 0
  return {
    ...publicStatus(),
    silentForMs,
    silentlyHealthy: silentForMs < SILENT_HEALTHY_MS,
  }
}
