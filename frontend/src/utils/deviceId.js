/**
 * 设备标识与渠道码。
 *
 * 设备 ID 是整套会员体系的锚点：它决定「谁开通了会员」。
 * 因为不采集手机号，所以这里生成的就是一个随机串，不含任何设备指纹
 * （不用 canvas/UA 指纹那类方案 —— 那属于个人信息，也容易误伤同一台机器上的多人）。
 *
 * 兼容性注意：通达信内置浏览器对 localStorage 限制较多（部分内核直接抛异常）。
 * 因此所有读写都包在 try 里，并保留一个内存兜底 —— 最坏情况是「本次会话内有效」，
 * 而不是整个页面直接崩掉。
 */

const DEVICE_KEY = 'duanxian:device:v1'
const CHANNEL_KEY = 'duanxian:channel:v1'

/** 支持 ?c=xxx / ?channel=xxx / ?from=xxx 三种写法，推广时不用记具体参数名 */
const CHANNEL_QUERY_KEYS = ['c', 'channel', 'from']

/** localStorage 不可用时的兜底（通达信内嵌内核 / 隐私模式） */
const memoryStore = new Map()

function readStore(key) {
  try {
    return localStorage.getItem(key)
  } catch (_) {
    return memoryStore.get(key) ?? null
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch (_) {
    memoryStore.set(key, value)
  }
}

function randomId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch (_) {
    // 非安全上下文下 randomUUID 可能不存在，走下面的兜底
  }

  // 兜底：32 位十六进制。虽然不如 UUID v4 规范，但 128 bit 的随机空间足够防碰撞。
  let out = ''
  for (let i = 0; i < 32; i += 1) {
    out += Math.floor(Math.random() * 16).toString(16)
  }
  return `d${out}`
}

/** 清洗渠道码：后端也会再洗一遍，这里先保证发出去的就是干净值 */
function sanitizeChannel(raw) {
  return String(raw || '').trim().slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '')
}

export function getDeviceId() {
  const existing = readStore(DEVICE_KEY)
  if (existing && existing.length >= 8) return existing

  const id = randomId()
  writeStore(DEVICE_KEY, id)
  return id
}

/**
 * 首次带渠道参数的访问会被记下来，之后不再覆盖（首次归因）。
 *
 * 为什么坚持首次归因：如果每次都覆盖，那么「A 渠道拉来的用户后来点了 B 渠道的分享链接」，
 * 贡献会被算到 B 头上，A 渠道的投放效果被系统性低估。首次归因更接近真相。
 */
export function captureChannel() {
  const existing = readStore(CHANNEL_KEY)
  if (existing) return existing

  try {
    const params = new URLSearchParams(window.location.search)
    for (const key of CHANNEL_QUERY_KEYS) {
      const value = params.get(key)
      if (!value) continue
      const clean = sanitizeChannel(value)
      if (clean) {
        writeStore(CHANNEL_KEY, clean)
        return clean
      }
    }
  } catch (_) {
    // URLSearchParams 不可用（极老内核）时静默跳过，不影响主流程
  }

  return ''
}

export function getChannel() {
  return readStore(CHANNEL_KEY) || ''
}

/**
 * 把当前页面地址补上渠道参数，用于「分享出去」的链接。
 * 带上 c=<自己的渠道>，对方通过这个链接进来时就会归因到同一条链路上。
 */
export function buildShareUrl(baseUrl, channel) {
  const channelValue = sanitizeChannel(channel)
  if (!channelValue) return baseUrl
  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}c=${encodeURIComponent(channelValue)}`
}
