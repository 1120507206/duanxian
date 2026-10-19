import { computed, ref } from 'vue'

/**
 * 涨停播报语音引擎（模块级单例）
 *
 * 对标 duanxianxai-vue3 的「涨停播报」语音：
 * - 开关状态持久化到 localStorage，跨页面 / 刷新保持；
 * - 首屏快照只「播种」不播报，只有页面加载后**新增**的涨停 / 炸板才出声，
 *   避免一进页面把当天几十只票全部念一遍；
 * - 文案口径与旧站一致：`${名称} 封涨停板，${连板}${题材}`。
 *
 * ── 音源 ──
 * 完全用浏览器自带的语音合成（Web Speech API），**不使用上游接口下发的音频地址**。
 * 两个原因：① 上游音频地址只存在于封板推送报文里，属于对方私有资源，依赖它等于把
 * 播报能力绑在别人的资源上；② 语音合成不产生额外网络请求，断流时播报照样出声。
 * 后端在规范化行情时也会把音频字段直接剔掉，链路上不存在这个依赖。
 *
 * ── 两条播报入口 ──
 * - `handlePush`：封板事件流直达，封板瞬间出声 —— 主路径；
 * - `handleSnapshot`：快照增量对比，兜底路径（事件流不可用时页面仍有播报，
 *   代价是慢一个轮询周期；两条路都用同一套 seenKeys 去重，不会念两遍）。
 *
 * 为什么是模块级单例：站点页和通达信独立页是两个入口，单例保证「已播报过的票」
 * 和「设置」在切换页面 / 两种宿主之间不重置。
 */

const STORAGE_KEY = 'duanxian:ztlive:voice:v1'

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
  const volume = Number(settings.value.volume)
  utterance.volume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1))

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

/**
 * 语音播报的权益门闩（付费墙砌在这里）。
 *
 * 由外部通过 setEntitlement 注入，取值来自后端 /api/ztlive 下发的 entitlements。
 * 为什么模块级而不是从 store 里读：本文件要保持与 Pinia 解耦 —— 站点页、独立页、
 * 未来的小程序壳都复用它，不能假设调用方一定装了 store。
 *
 * 注意这里只是「防止直接改 localStorage 白嫖」的兜底。真正的权益判定在后端，
 * 前端永远只是镜像。
 */
let entitled = false

function acceptAnnouncement(key) {
  const now = Date.now()
  if (key === lastSpeakKey && now - lastSpeakAt < 1500) return false
  lastSpeakKey = key
  lastSpeakAt = now
  return true
}

/** 事件去重键：同一只票「炸板后回封」会带新的 firstTime，因此会被当成新事件播报 */
const eventKey = (row) => `${row?.code || ''}|${row?.status || ''}|${row?.firstTime || ''}`

/**
 * 播报前的统一闸门：开关 → 权益 → 分类开关 → 去重。
 * 快照路径和事件路径共用这一套，否则两边的判定迟早会分叉。
 */
function tryAnnounce(row) {
  if (!settings.value.enabled) return false
  // 权益门闩：非会员即使把 localStorage 里的 enabled 改成 true 也不会出声。
  // 试听（preview）不经过这里，所以未付费用户始终能听到示例播报 —— 那是转化钩子，必须免费。
  if (!entitled) return false

  const sealed = row?.status === '涨停'
  if (sealed && !settings.value.announceSealed) return false
  if (!sealed && !settings.value.announceBlown) return false

  const key = eventKey(row)
  if (!acceptAnnouncement(key)) return false

  return enqueue(sealed ? buildZtSpeechText(row) : buildBlownSpeechText(row))
}

/**
 * 封板 / 炸板事件直达（主路径，来自实时事件流）。
 *
 * 与快照路径共享同一本 seenKeys 账，两个方向都靠它去重：
 *   · 事件先到 → 登记；紧接着的快照把它当「已见过」，不再念第二遍；
 *   · 快照先到（事件流断过）→ 已经念过；随后补发的同一条事件不再念；
 *   · 上游重发 / 断线补发同一条封板 → 直接跳过。
 *
 * 注意判重键带 firstTime，所以「炸板后回封」是新键、会正常播报 ——
 * 这里去重的是「同一次封板事件被送达多次」，不是「同一只票只能播一次」。
 */
function handlePush(row) {
  if (!row?.code) return false
  const key = eventKey(row)
  if (seenKeys.has(key)) return false
  seenKeys.add(key)
  return tryAnnounce(row)
}

/**
 * 拿快照做增量对比（兜底路径）：首次调用只登记不播报，之后新增的行才播报。
 * 事件流正常工作时，这里的「新增」基本都已经被 handlePush 登记过，不会出声；
 * 事件流不可用时，它就顶上，代价是慢一个轮询周期。
 */
function handleSnapshot(list = []) {
  const rows = Array.isArray(list) ? list : []
  const fresh = []

  rows.forEach((row) => {
    const key = eventKey(row)
    if (seenKeys.has(key)) return
    seenKeys.add(key)
    fresh.push(row)
  })

  if (!seeded) {
    seeded = true
    return
  }

  fresh.forEach((row) => tryAnnounce(row))
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
    // 非会员不允许开启（UI 会先拦一道，这里是兜底）
    if (next && !entitled) return false

    // ElSwitch 同一轮可能连发两次同值事件（组件内 model-value 是异步更新的），
    // 不拦一下「语音播报已开启」会被念两遍。
    if (next === settings.value.enabled || switchSettling) return true
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
    return true
  }

  /**
   * 注入会员权益。由页面在拿到 /api/ztlive 的 entitlements 后调用。
   *
   * 会员过期时会把开关一起关掉，否则会出现「已经过期了但页面还在念」的诡异状态，
   * 用户会以为自己还有权益，等发现时体验更差。
   */
  function setEntitlement(allowed) {
    const next = Boolean(allowed)
    if (next === entitled) return
    entitled = next

    if (!next) {
      stopAll()
      if (settings.value.enabled) {
        settings.value.enabled = false
        writeSettings(settings.value)
      }
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
      enqueue(buildZtSpeechText(row))
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
    setEntitlement,
    updateSettings,
    preview,
    handlePush,
    handleSnapshot,
    resetSeen,
    stopAll,
  }
}

