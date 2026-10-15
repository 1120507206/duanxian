import { computed, ref } from 'vue'

/**
 * 涨停播报语音引擎（模块级单例）
 *
 * 对标 duanxianxai-vue3 的「涨停播报」语音：
 * - 开关状态持久化到 localStorage，跨页面 / 刷新保持；
 * - 首屏快照只「播种」不播报，只有页面加载后**新增**的涨停 / 炸板才出声，
 *   避免一进页面把当天几十只票全部念一遍；
 * - 文案口径与旧站一致：`${名称} 封涨停板，${连板}${题材}`；
 * - 若服务端某行带 readurl（mp3 hash，旧站音源），优先播 mp3；没有则用浏览器语音合成。
 *
 * 为什么是模块级单例：站点页和通达信独立页是两个入口，单例保证「已播报过的票」
 * 和「设置」在切换页面 / 两种宿主之间不重置。
 */

const STORAGE_KEY = 'duanxian:ztlive:voice:v1'

/** 旧站 mp3 音源域名（后端下发 readurl 时使用，与 duanxianxai-vue3 一致） */
export const ZT_AUDIO_BASE = 'https://bm.duanxianxia.com'

const DEFAULTS = {
  enabled: false,
  rate: 1,
  volume: 1,
  announceSealed: true,
  announceBlown: true,
}

function readSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    return { ...DEFAULTS, ...(parsed && typeof parsed === 'object' ? parsed : {}) }
  } catch (_) {
    return { ...DEFAULTS }
  }
}

function writeSettings(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch (_) {
    // 隐私模式 / 配额满：静默降级，仅本次会话生效
  }
}

const settings = ref(readSettings())
const voices = ref([])

let voicesBound = false
let primed = false

const speechSupported = () => typeof window !== 'undefined'
  && typeof window.speechSynthesis !== 'undefined'
  && typeof window.SpeechSynthesisUtterance !== 'undefined'

function bindVoices() {
  if (voicesBound || !speechSupported()) return
  voicesBound = true
  const sync = () => {
    voices.value = window.speechSynthesis.getVoices() || []
  }
  sync()
  window.speechSynthesis.addEventListener?.('voiceschanged', sync)
}

/** 中文音色优先级：优先本地/微软音色，其次任意 zh 音色 */
const ZH_PREFERRED = [/xiaoxiao/i, /yaoyao/i, /yunxi/i, /huihui/i, /ting-?ting/i, /kangkang/i, /meijia/i, /zh[-_]?cn/i]

function pickVoice() {
  if (!voices.value.length) return null
  for (const pattern of ZH_PREFERRED) {
    const hit = voices.value.find((voice) => pattern.test(voice.name || '') || pattern.test(voice.lang || ''))
    if (hit) return hit
  }
  return voices.value.find((voice) => /zh/i.test(voice.lang || '')) || null
}

/**
 * 用户手势解锁 —— 浏览器自动播放策略要求「本文档发生过用户交互」后才允许发声。
 * 开关本身就是一次点击，所以开启时顺手播一句「语音播报已开启」，既解锁也顺带验证
 * 当前宿主（例如通达信内置浏览器）到底能不能出声。
 */
function primeOnce() {
  if (primed || !speechSupported()) return
  primed = true
  try {
    window.speechSynthesis.resume?.()
  } catch (_) {
    // 忽略：部分内核没有 resume
  }
}

/** 播放队列：一次只念一条，最多积压 3 条，避免行情密集时念到过期内容 */
const queue = []
let draining = false

function speakNext() {
  if (draining) return
  const next = queue.shift()
  if (!next) return
  if (!speechSupported()) return

  draining = true
  const utterance = new window.SpeechSynthesisUtterance(next.text)
  const voice = pickVoice()
  if (voice) utterance.voice = voice
  utterance.lang = voice?.lang || 'zh-CN'
  utterance.rate = Number(settings.value.rate) || 1
  utterance.volume = Math.min(1, Math.max(0, Number(settings.value.volume) ?? 1))

  const phraseEnded = () => {
    draining = false
    speakNext()
  }
  utterance.onend = phraseEnded
  utterance.onerror = phraseEnded

  try {
    window.speechSynthesis.speak(utterance)
  } catch (_) {
    phraseEnded()
  }
}

function enqueue(text) {
  const content = String(text || '').trim()
  if (!content) return false
  if (!speechSupported()) return false
  if (queue.length >= 3) queue.shift()
  queue.push({ text: content })
  speakNext()
  return true
}

function stopAll() {
  queue.length = 0
  draining = false
  if (speechSupported()) {
    try {
      window.speechSynthesis.cancel()
    } catch (_) {
      // 忽略：部分内核没有 cancel
    }
  }
}

/** 裸 hash → 完整 mp3 地址（与 duanxianxai-vue3 的 buildZtReadUrl 同口径） */
export function buildZtReadUrl(readurl) {
  const value = String(readurl || '').trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return `${ZT_AUDIO_BASE}/static/upload/read/${value.replace(/\.mp3$/i, '')}.mp3`
}

const EMPTY_LABELS = new Set(['', '--', '其他', '未知'])

/** 播报文案：`${名称} 封涨停板，${连板}${题材}`（与旧站逐字一致） */
export function buildZtSpeechText(row = {}) {
  const name = String(row.name || '').trim()
  const board = EMPTY_LABELS.has(String(row.board || '').trim()) ? '' : String(row.board).trim()
  const plate = EMPTY_LABELS.has(String(row.plate || '').trim()) ? '' : String(row.plate).trim()
  const suffix = `${board}${plate}`
  return `${name} 封涨停板${suffix ? `，${suffix}` : ''}`
}

export function buildBlownSpeechText(row = {}) {
  return `${String(row.name || '').trim()} 炸板`
}

const seenKeys = new Set()
let seeded = false
let lastSpeakAt = 0
let lastSpeakKey = ''
let switchSettling = false

function acceptAnnouncement(key) {
  const now = Date.now()
  if (key === lastSpeakKey && now - lastSpeakAt < 1500) return false
  lastSpeakKey = key
  lastSpeakAt = now
  return true
}

/**
 * mp3 音源（后端下发 readurl 时优先用旧站同款音色，失败回落语音合成）。
 * 当前后端快照还不带 readurl，这条分支属于预留：字段一到位就自动生效。
 */
function playAudioUrl(url, fallbackText = '') {
  try {
    const audio = new Audio(url)
    audio.volume = Math.min(1, Math.max(0, Number(settings.value.volume) ?? 1))
    audio.play().catch(() => {
      if (fallbackText) enqueue(fallbackText)
    })
    return true
  } catch (_) {
    if (fallbackText) enqueue(fallbackText)
    return false
  }
}

function announce(row, text) {
  const readurl = buildZtReadUrl(row?.readurl || row?.audio || '')
  if (readurl) {
    playAudioUrl(readurl, text)
    return
  }
  enqueue(text)
}

/**
 * 拿快照做增量对比：首次调用只登记不播报，之后新增的行才播报。
 * key 带上 firstTime，因此「炸板后回封」会被当成新事件播报。
 */
function handleSnapshot(list = []) {
  const rows = Array.isArray(list) ? list : []
  const fresh = []

  rows.forEach((row) => {
    const key = `${row?.code || ''}|${row?.status || ''}|${row?.firstTime || ''}`
    if (seenKeys.has(key)) return
    seenKeys.add(key)
    fresh.push(row)
  })

  if (!seeded) {
    seeded = true
    return
  }

  if (!settings.value.enabled) return

  fresh.forEach((row) => {
    const sealed = row?.status === '涨停'
    if (sealed && !settings.value.announceSealed) return
    if (!sealed && !settings.value.announceBlown) return
    const text = sealed ? buildZtSpeechText(row) : buildBlownSpeechText(row)
    if (acceptAnnouncement(`${row?.code}|${row?.status}|${row?.firstTime}`)) announce(row, text)
  })
}

function resetSeen() {
  seenKeys.clear()
  seeded = false
}

export function useZtVoice() {
  bindVoices()

  const engineReady = computed(() => speechSupported() && voices.value.length > 0)
  const engineStatus = computed(() => {
    if (!speechSupported()) return '不可用'
    if (!voices.value.length) return '音色加载中'
    return pickVoice() ? '就绪' : '缺少中文音色'
  })

  function setEnabled(value) {
    const next = Boolean(value)
    // ElSwitch 同一轮可能连发两次同值事件（组件内 model-value 是异步更新的），
    // 不拦一下「语音播报已开启」会被念两遍。
    if (next === settings.value.enabled || switchSettling) return
    switchSettling = true
    queueMicrotask(() => {
      switchSettling = false
    })

    settings.value.enabled = next
    writeSettings(settings.value)
    if (settings.value.enabled) {
      primeOnce()
      enqueue('语音播报已开启')
    } else {
      stopAll()
    }
  }

  function updateSettings(patch = {}) {
    settings.value = { ...settings.value, ...patch }
    writeSettings(settings.value)
  }

  /** 试听：优先念最近一条真实涨停，没有数据时念示例文案 */
  function preview(rows = []) {
    primeOnce()
    const row = (Array.isArray(rows) ? rows : []).find((item) => item?.status === '涨停')
    if (row) {
      announce(row, buildZtSpeechText(row))
      return
    }
    enqueue('示例播报，东方财富 封涨停板，2板，金融科技')
  }

  return {
    settings,
    enabled: computed({
      get: () => settings.value.enabled,
      set: (value) => setEnabled(value),
    }),
    engineReady,
    engineStatus,
    speechSupported,
    setEnabled,
    updateSettings,
    preview,
    handleSnapshot,
    resetSeen,
    stopAll,
  }
}

