import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import tls from 'node:tls'
import { Manager } from 'socket.io-client'
import config from '../config/index.js'
import * as logger from '../utils/logger.js'
import { normalizeEventRow } from './ztliveService.js'

/**
 * 上游封板事件流客户端（方案 B：后端中转）。
 *
 * ── 传输方式：dxx-ws-v2（Socket.IO v4）──
 * 上游已从裸 WebSocket（`wss1~3`）切到 Socket.IO：
 *   · 地址 `https://t.duanxianxia.com`，`path` 必须是 `/dxx`（是参数，不是 URL 路径）；
 *   · 封板频道 = namespace `/ztlive`，事件名 `zt`；
 *   · 只支持 `transports: ['websocket']`（服务端关掉了长轮询）；
 *   · 无鉴权、无订阅协议：连上 namespace 就收到该频道全部消息；
 *   · 心跳由 Socket.IO 自己管（服务端 pingInterval 25s / pingTimeout 60s），
 *     所以这里**不再手写 'ping' 帧** —— 那套心跳是裸 WS 时代的产物。
 * 报文 `from` 取值与旧版一致（封板仍是 `ztpool`），所以下游渲染 / 播报逻辑不用动。
 *
 * ── 为什么不让浏览器直连上游 ──
 * 上游不校验 Origin，前端直连也能通。但那样把三方地址、报文格式、重连策略
 * 全散在客户端，对方哪天加白名单或改协议，所有已发出去的版本一起挂。收在后端之后：
 *   ① 前端只有一个网络边界（自己的域名），上游怎么变都在服务端消化；
 *   ② 连接数从「每个标签页一条」收敛成「整个服务一条」，上游压力可控；
 *   ③ 将来要做权益门控 / 报文脱敏，改一处就生效。
 *
 * ── 与快照的关系 ──
 * 这是**事件流**，不是数据源替代品：只推「刚封板 / 刚炸板」的那一只。全量列表、
 * 统计、板块仍然由 ztliveService 的快照轮询负责。两条链路互补，缺一不可。
 */

/** 兜底校验：万一上游把别的频道塞进来，用它挡掉 */
const EXPECTED_FROM = 'ztpool'
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

let manager = null
let socket = null
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

function setState(next, patch = {}) {
  Object.assign(status, patch)
  if (status.state !== next) status.state = next
  emitStatus()
}

/**
 * TLS 选项。
 *
 * `t.duanxianxia.com` 握手时**只下发站点证书、不带中间证书**（Certum DV TLS G2 R39 CA）。
 * 浏览器会顺着证书里的 AIA 地址自己把中间证书补下来，Node 不会 —— 于是默认信任链
 * 直接报 `unable to verify the first certificate`，连接根本建不起来。
 * 这里把中间证书并进默认根证书池，等价于浏览器补做的那一步，**不放宽校验**。
 * `ZTLIVE_WS_CA_FILE` 可以指向别的文件（上游换证书时不用改代码）。
 */
function buildTlsOptions() {
  const caFile = config.ztliveWsCaFile
  if (!caFile) return {}
  try {
    return { ca: [...tls.rootCertificates, readFileSync(caFile, 'utf8')] }
  } catch (error) {
    // 读不到就退回默认信任链：连不上会走 connect_error，日志里能看出是证书问题
    logger.warn('ztlive_ws_ca_unreadable', { file: caFile, message: error.message })
    return {}
  }
}

/** 上游报文 → 事件对象。非行情 / 非 ztpool 一律丢弃 */
function toEventRow(payload) {
  let info = payload
  if (typeof payload === 'string') {
    try {
      info = JSON.parse(payload)
    } catch (_) {
      return null
    }
  }
  if (!info || typeof info !== 'object') return null

  // `/ztlive` 频道按约定只有封板；仍然判一次 from，避免上游把异动混进同一条流
  if (info.from && info.from !== EXPECTED_FROM) return null

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
  if (!started || manager) return

  const url = config.ztliveWsUrl
  const ns = config.ztliveWsNamespace
  status.url = `${url}${ns}`
  setState('connecting', { lastError: '' })

  try {
    manager = new Manager(url, {
      path: config.ztliveWsPath,
      transports: ['websocket'],
      // 重连交给 Socket.IO：指数退避 1s → 30s，永不放弃
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
      timeout: 20_000,
      ...buildTlsOptions(),
    })
  } catch (error) {
    manager = null
    setState('closed', { lastError: error.message })
    logger.warn('ztlive_ws_ctor_failed', { url, message: error.message })
    return
  }

  manager.on('reconnect_attempt', (attempt) => {
    status.reconnects += 1
    setState('connecting')
    logger.warn('ztlive_ws_reconnect', { attempt })
  })

  socket = manager.socket(ns)

  socket.on('connect', () => {
    setState('open', { connectedAt: Date.now(), lastError: '' })
    logger.info('ztlive_ws_open', { url: status.url, sid: socket.id })
  })

  socket.on('disconnect', (reason) => {
    setState('closed')
    logger.warn('ztlive_ws_closed', {
      reason,
      connectedForMs: status.connectedAt ? Date.now() - status.connectedAt : 0,
    })
  })

  socket.on('connect_error', (error) => {
    setState('closed', { lastError: error?.message || 'connect_error' })
    logger.warn('ztlive_ws_connect_error', { url: status.url, message: error?.message || '' })
  })

  socket.on(config.ztliveWsEvent, (payload) => {
    status.receivedFrames += 1
    const row = toEventRow(payload)
    if (!row) return
    logger.info('ztlive_ws_ztpool', { code: row.code, name: row.name, status: row.status })
    publish(row)
  })
}

export function start() {
  if (started) return
  if (!status.enabled) {
    logger.info('ztlive_ws_disabled', { hint: 'ZTLIVE_WS_ENABLED=0，仅走快照轮询' })
    return
  }
  started = true
  logger.info('ztlive_ws_starting', {
    url: `${config.ztliveWsUrl}${config.ztliveWsNamespace}`,
    path: config.ztliveWsPath,
    transport: 'socket.io',
  })
  connect()
}

export function stop() {
  started = false
  if (socket) {
    try {
      socket.removeAllListeners()
      socket.disconnect()
    } catch (_) {
      /* 忽略：进程退出路径上的关闭失败无需处理 */
    }
    socket = null
  }
  if (manager) {
    try {
      manager.removeAllListeners()
      manager.disconnect()
    } catch (_) {
      /* 同上 */
    }
    manager = null
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
