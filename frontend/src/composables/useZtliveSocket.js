import { onBeforeUnmount, ref } from 'vue'
import { getDeviceId } from '@/utils/deviceId'
import { getSessionToken } from '@/utils/sessionToken'

/**
 * 实时事件流订阅（SSE）。
 *
 * 数据来自自家后端的 `/api/ztlive/stream`，由后端去连上游封板频道再转发下来 ——
 * 前端只认识自己的域名，上游地址、重连策略、报文格式全在服务端消化。
 *
 * ── 为什么用 EventSource 而不是 WebSocket ──
 * 这条链路只需要「服务端单向推」，EventSource 天生就是这个语义：
 *   · 内置断线重连，还会自动带上 `Last-Event-ID`，服务端据此补发断线期间漏掉的封板事件；
 *   · 走标准 HTTP，Nginx / 企业代理 / 通达信内核浏览器都不需要额外配置。
 *
 * ── 拿不到流时的行为 ──
 * 后端未启用、连不上、或宿主内核不支持时，这里只会停在非 open 状态，
 * **页面功能完全不受影响**：全量行情仍然由 useZtliveFeed 的快照轮询提供，
 * 只是少了「封板瞬间直达」这一档体验。
 */

/** 通道状态文案，站点页与独立页共用同一套口径 */
export const REALTIME_STATUS_TEXT = {
  idle: '实时通道待连接',
  connecting: '实时通道连接中',
  open: '实时通道已连接',
  closed: '实时通道已断开',
  disabled: '实时通道未启用',
  unsupported: '当前环境不支持实时通道',
}

/** 通道已连接但迟迟没有推送时，用来区分「连着但没行情」和「压根没连上」 */
export const REALTIME_HEALTHY_HINT = '已连接，等待封板推送'

/**
 * 拼出事件流地址。
 *
 * 身份只能走 query 参数 —— EventSource 不支持自定义请求头，这是浏览器的硬约束
 * （站内其它接口用 X-Session-Token 头的约定在这里用不了）。后端两个来源都认。
 */
export function buildZtliveStreamUrl() {
  const params = new URLSearchParams()
  const token = getSessionToken()
  if (token) params.set('token', token)
  const deviceId = getDeviceId()
  if (deviceId) params.set('d', deviceId)
  const query = params.toString()
  return `/api/ztlive/stream${query ? `?${query}` : ''}`
}

/**
 * @param {object} [options]
 * @param {(event: object) => void} [options.onEvent] 收到封板/炸板事件
 * @param {(status: string) => void} [options.onStatus] 通道状态变化
 * @param {(state: object) => void} [options.onUpstream] 后端与上游的连接状态变化（用于排查）
 * @param {boolean} [options.enabled] 关掉则不建立连接
 */
export function useZtliveSocket({ onEvent, onStatus, onUpstream, enabled = true } = {}) {
  const status = ref('idle')
  let source = null
  let disposed = false

  function setStatus(next) {
    if (status.value !== next) status.value = next
    onStatus?.(next)
  }

  function close() {
    if (!source) return
    // 先摘回调再关：否则 close() 触发的 error/close 会把状态改回 closed，
    // 而我们此时其实是「主动断开」，两者的后续处理完全不同
    source.onerror = null
    source.onopen = null
    source.close()
    source = null
  }

  function connect() {
    if (disposed) return
    if (!enabled) {
      setStatus('disabled')
      return
    }
    if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
      setStatus('unsupported')
      return
    }
    if (source) return

    setStatus('connecting')

    try {
      source = new EventSource(buildZtliveStreamUrl())
    } catch (_) {
      setStatus('closed')
      return
    }

    source.onopen = () => setStatus('open')

    source.addEventListener('hello', (event) => {
      // 握手报文：带上后端与上游的连接状态，用来区分「我们没连上」和「上游没连上」
      try {
        const payload = JSON.parse(event.data)
        onUpstream?.(payload.upstream || null)
      } catch (_) {
        /* 报文异常不影响主流程 */
      }
      setStatus('open')
    })

    source.addEventListener('status', (event) => {
      try {
        onUpstream?.(JSON.parse(event.data))
      } catch (_) {
        /* 忽略 */
      }
    })

    source.addEventListener('ztpool', (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload?.row) onEvent?.(payload)
      } catch (_) {
        /* 单条报文损坏不该影响后续：跳过即可，EventSource 会自动继续 */
      }
    })

    source.onerror = () => {
      // EventSource 自己会按服务端下发的 retry(=3s) 重连，这里只如实反映「当前断了」。
      // 注意：若后端返回非 200（例如事件流未启用），按规范浏览器会直接放弃、不再重连，
      // 所以这里不需要额外的重试节流。
      if (source?.readyState === 2) setStatus('closed')
      else setStatus('connecting')
    }
  }

  /** 身份变化（登录/退出）后重建连接：query 里的 token 变了，旧连接带的是旧身份 */
  function restart() {
    close()
    if (disposed) return
    connect()
  }

  if (enabled) connect()
  onBeforeUnmount(() => {
    disposed = true
    close()
  })

  return {
    status,
    connect,
    close,
    restart,
  }
}
