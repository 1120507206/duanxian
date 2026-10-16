import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchZtlive } from '@/api'
import { useZtliveSocket } from '@/composables/useZtliveSocket'

// 上游快照文件约每 3 秒重写一次，前端按 3 秒轮询即可（与站点页/独立页共用同一节奏）。
export const ZTLIVE_REFRESH_INTERVAL = 3000

/** 超过这个秒数没有成功拿到数据，页面会提示「数据可能滞后」 */
export const ZTLIVE_STALE_WARN_SECONDS = 30

/**
 * 页面处于后台时的轮询间隔。
 *
 * 后台**不能停轮询**：快照轮询是「全量列表 + 兜底」的唯一来源，停掉页面就会停在旧数据上。
 * 但隐藏页的定时器会被浏览器节流（Chrome：隐藏后最快 ~1 秒一次，隐藏满 5 分钟降到约 1 分钟一次），
 * 所以这里只降频、不停止。
 *
 * 注意：**实时播报不依赖这个定时器** —— 封板事件走 SSE，而网络事件不受定时器节流影响，
 * 所以切到后台照样准点出声。这正是接入事件流之后最实际的收益。
 */
const HIDDEN_REFRESH_INTERVAL = 10000

/** 新行高亮保持时长：足够看清是哪一只，又不至于整屏都在闪 */
const FRESH_HOLD_MS = 6000

/**
 * 推送行的保护期。
 *
 * 封板推送到达时，上游快照往往还没收录这只票（CDN 约 3 秒缓存 + 3 秒轮询窗口）。
 * 如果没有保护期，下一轮快照会把刚置顶的行直接抹掉 —— 用户看到的是「闪一下就没了」。
 * 所以推送进来的行会登记在册：快照未收录期间由 mergeWithPending 并回列表，
 * 收录后自然让位，超时（说明上游始终没认这只票）才彻底丢弃。
 */
const PENDING_TTL_MS = 120000

/** 列表上限：事件流可能连续推入，防止异常情况下无限增长 */
const MAX_ROWS = 800

const NUMERIC_SORT_PROPS = new Set([
  'pct', 'auctionPct', 'boardNumber', 'price', 'sealAmount', 'amount', 'turnoverRate', 'floatMarketCap',
])

function sortableValue(row, prop) {
  if (NUMERIC_SORT_PROPS.has(prop)) return Number(row[prop])
  return row[prop] ?? ''
}

/**
 * 涨停播报数据源：快照轮询（全量）+ 事件流（瞬时）+ 板块/搜索筛选 + 排序。
 * 站点页（views/Ztlive.vue）和通达信独立页（views/ZtliveEmbed.vue）共用同一份口径。
 *
 * 两条链路的分工是刻意分开的，不要互相替代：
 *   · 快照轮询 = 全量列表 / 统计 / 板块，以及冷启动与断流时的兜底；
 *   · 事件流   = 「刚封板 / 刚炸板」的那一只，用来瞬时播报 + 新行置顶打闪。
 * 上游快照从来不含音频地址，而语音播报用的是本地语音合成、不看上游字段，
 * 所以这里也不需要为「音源」留任何特殊通道。
 *
 * @param {object} [options]
 * @param {number} [options.refreshInterval] 轮询间隔，默认 3 秒（上游快照约 3 秒重写一次）
 * @param {(list: object[]) => void} [options.onSnapshot] 每次拿到快照后回调（含首屏），供语音播报做增量对比
 * @param {(row: object, event: object) => void} [options.onZtPush] 收到封板/炸板事件时回调，供语音播报即时出声
 * @param {(entitlements: object) => void} [options.onEntitlements] 会员权益回调。
 *   后端把权益随行情一起下发，用它做「另一个标签页激活后，本页几秒内自动解锁」，
 *   不额外发请求。这里用回调而不是直接读 Pinia，是为了让本文件保持与 store 解耦 ——
 *   站点页、独立页、将来的其它宿主壳都复用它。
 * @param {(message: string) => void} [options.onError] 拉取失败回调，供埋点统计链路健康度
 * @param {boolean} [options.enableRealtime] 是否订阅封板事件流（默认开；关掉即退回纯轮询）
 */
export function useZtliveFeed({
  refreshInterval = ZTLIVE_REFRESH_INTERVAL,
  onSnapshot,
  onZtPush,
  onEntitlements,
  onError,
  enableRealtime = true,
} = {}) {
  const initialLoading = ref(true)
  /**
   * 用户可见的「加载中」：只在**手动刷新**时置位，轮询绝不触碰它。
   *
   * 早期实现每次轮询都把它置为 true，于是每 3 秒表格闪一次遮罩、刷新按钮转一次圈，
   * 正在看盘的人会被反复打断。数据本来就是静默轮换的，不该抢注意力 ——
   * 所以这里把「加载态」和「有没有请求在飞」拆成两个概念（后者见 inFlight）。
   */
  const refreshing = ref(false)
  const errorText = ref('')
  const payload = ref({ date: '--', list: [], plates: [], summary: null })
  const activePlate = ref('')
  const hideUnselected = ref(false)
  const searchText = ref('')
  const sortState = ref({ prop: 'firstTime', order: 'descending' })
  const lastUpdatedAt = ref('')
  const staleSeconds = ref(0)
  /** 最近一次收到封板事件的时间（与快照的 lastUpdatedAt 分开，两者是不同链路） */
  const lastPushAt = ref(0)
  let timerId = null
  let staleTimerId = null
  let lastPollAt = 0
  /** 并发保护：与 UI 状态解耦 —— 轮询也要挡重复请求，但不该显示 loading */
  let inFlight = false

  /**
   * 推送行登记表：code → { row, addedAt, freshTimer }。
   * `row` 必须是**响应式代理**（从 payload.value.list 上取回来的那个），
   * 直接存原始对象的话，改 `__fresh` 不会触发渲染，高亮永远不会消退。
   */
  const pendingPushes = new Map()

  const summary = computed(() => payload.value.summary || {
    total: 0,
    sealed: 0,
    blown: 0,
    sealRate: 0,
    maxBoard: 0,
  })

  const dataDate = computed(() => payload.value.date || '--')
  const isEmpty = computed(() => !initialLoading.value && !payload.value.list.length && !errorText.value)

  const filteredRows = computed(() => {
    const keyword = searchText.value.trim().toLowerCase()
    let rows = payload.value.list

    if (activePlate.value && hideUnselected.value) {
      rows = rows.filter((row) => row.plate === activePlate.value)
    }

    if (keyword) {
      rows = rows.filter((row) => (
        String(row.name).toLowerCase().includes(keyword)
        || String(row.code).toLowerCase().includes(keyword)
        || String(row.topic).toLowerCase().includes(keyword)
      ))
    }

    const { prop, order } = sortState.value
    if (!prop || !order) return rows

    return [...rows].sort((a, b) => {
      const left = sortableValue(a, prop)
      const right = sortableValue(b, prop)
      let result = 0

      if (typeof left === 'number' && typeof right === 'number') {
        result = (Number.isFinite(left) ? left : -Infinity) - (Number.isFinite(right) ? right : -Infinity)
      } else {
        result = String(left).localeCompare(String(right), 'zh-CN', { numeric: true })
      }

      return order === 'ascending' ? result : -result
    })
  })

  const visibleCountText = computed(() => {
    const total = payload.value.list.length
    const visible = filteredRows.value.length
    return total === visible ? `${total} 条` : `${visible} / ${total} 条`
  })

  // ── 事件流 ────────────────────────────────────────────────
  const socket = useZtliveSocket({
    enabled: enableRealtime,
    onEvent: (event) => applyPush(event.row, event),
  })
  const realtimeStatus = socket.status

  function registerPending(code, row) {
    const previous = pendingPushes.get(code)
    if (previous?.freshTimer) clearTimeout(previous.freshTimer)

    const entry = { row, addedAt: Date.now(), freshTimer: null }
    entry.freshTimer = setTimeout(() => {
      // 高亮到点自然消退。登记本身继续留着，直到快照收录或保护期结束 ——
      // 它还在承担「别被下一轮旧快照抹掉」的职责。
      row.__fresh = false
      entry.freshTimer = null
    }, FRESH_HOLD_MS)

    pendingPushes.set(code, entry)
  }

  /**
   * 把一条封板/炸板事件并进列表：命中已有行就原地更新并置顶，否则插到最前面。
   *
   * 行结构由后端统一规范化过，与快照行**完全同构**，所以这里不需要任何字段映射，
   * 也不存在「事件行和快照行长得不一样」的隐患。
   */
  function applyPush(row, event) {
    const code = String(row?.code || '')
    if (!/^\d{6}$/.test(code)) return null

    const list = payload.value.list
    let target = list.find((item) => item.code === code)

    if (target) {
      Object.assign(target, row)
      target.__fresh = true
      const index = list.indexOf(target)
      if (index > 0) {
        list.splice(index, 1)
        list.unshift(target)
      }
    } else {
      list.unshift({ ...row, __fresh: true })
      // 重新取一次：unshift 进去的是原始对象，list[0] 读出来才是响应式代理
      target = list[0]
      if (list.length > MAX_ROWS) list.splice(MAX_ROWS)
    }

    registerPending(code, target)
    lastPushAt.value = Date.now()

    if (typeof onZtPush === 'function') onZtPush(target, event)

    return target
  }

  /**
   * 快照与推送行合并。
   *
   * 三条规则：
   *   ① 过期登记先清掉（超过保护期说明上游始终没收录，这只票的推送价值已经过期）；
   *   ② 快照已收录的行，**沿用推送时的行对象**，只把字段刷成服务端口径 ——
   *      换新对象会把高亮和定时器一起丢掉，用户会看到高亮突然熄灭；
   *   ③ 快照还没收录的行，插回列表最前面，避免被这一轮快照整体替换掉。
   */
  function mergeWithPending(serverList) {
    const now = Date.now()

    for (const [code, entry] of [...pendingPushes]) {
      if (now - entry.addedAt > PENDING_TTL_MS) {
        if (entry.freshTimer) clearTimeout(entry.freshTimer)
        pendingPushes.delete(code)
      }
    }

    const merged = serverList.map((item) => {
      const entry = pendingPushes.get(item.code)
      if (!entry) return item

      const target = entry.row
      const fresh = target.__fresh
      // 服务端行里没有 __fresh 字段，不会被覆盖；显式写回是为了防止将来上游多加字段时踩到
      Object.assign(target, item, { __fresh: fresh })
      return target
    })

    const serverCodes = new Set(serverList.map((item) => item.code))
    const extras = [...pendingPushes.entries()]
      .filter(([code]) => !serverCodes.has(code))
      .sort((left, right) => right[1].addedAt - left[1].addedAt)
      .map(([, entry]) => entry.row)

    return extras.length ? [...extras, ...merged] : merged
  }

  function selectPlate(name) {
    activePlate.value = activePlate.value === name ? '' : name
  }

  function onSortChange({ prop, order }) {
    sortState.value = { prop, order }
  }

  /**
   * 拉一次快照。
   *
   * @param {object} [options]
   * @param {boolean} [options.manual] 用户主动点「刷新」：失败时弹错误提示
   * @param {boolean} [options.silent] 静默刷新（定时轮询 / 切回前台）：绝不设置 refreshing，
   *   所以表格不闪遮罩、刷新按钮不转圈 —— 这是「只有第一次加载才 loading」的关键
   */
  async function loadData({ manual = false, silent = false } = {}) {
    if (inFlight) return
    inFlight = true

    const showLoading = !silent
    if (showLoading) refreshing.value = true
    errorText.value = ''

    try {
      const next = await fetchZtlive()
      const serverList = Array.isArray(next?.list) ? next.list : []
      payload.value = {
        date: next?.date || '--',
        list: mergeWithPending(serverList),
        plates: Array.isArray(next?.plates) ? next.plates : [],
        summary: next?.summary || null,
      }
      lastUpdatedAt.value = next?.timestamp || new Date().toISOString()
      if (typeof onSnapshot === 'function') onSnapshot(payload.value.list)
      // 权益随行情一起回来，用它持续校准会员状态（会员过期 / 异地激活都能自动同步）
      if (next?.entitlements && typeof onEntitlements === 'function') onEntitlements(next.entitlements)
    } catch (error) {
      errorText.value = error.response?.data?.error || '涨停播报暂时无法加载，请检查后端和数据源连接'
      if (typeof onError === 'function') onError(errorText.value)
      if (manual) ElMessage.error(errorText.value)
    } finally {
      initialLoading.value = false
      if (showLoading) refreshing.value = false
      inFlight = false
    }
  }

  /** 从后台切回前台时立刻补一次，避免「切回来还要等一整个轮询周期」 */
  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      lastPollAt = Date.now()
      // 补数据不是用户点了刷新：静默换，避免一回到页面就闪遮罩
      loadData({ silent: true })
    }
  }

  function pollTick() {
    const hidden = document.visibilityState !== 'visible'
    const now = Date.now()
    if (hidden && now - lastPollAt < HIDDEN_REFRESH_INTERVAL) return
    lastPollAt = now
    loadData({ silent: true })
  }

  function startPolling() {
    stopPolling()
    lastPollAt = Date.now()
    timerId = window.setInterval(pollTick, refreshInterval)

    staleTimerId = window.setInterval(() => {
      const at = lastUpdatedAt.value ? new Date(lastUpdatedAt.value).getTime() : 0
      staleSeconds.value = at ? Math.max(0, Math.round((Date.now() - at) / 1000)) : 0
    }, 1000)

    document.addEventListener('visibilitychange', handleVisibilityChange)
  }

  function stopPolling() {
    if (timerId) {
      window.clearInterval(timerId)
      timerId = null
    }
    if (staleTimerId) {
      window.clearInterval(staleTimerId)
      staleTimerId = null
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }

  onMounted(async () => {
    // 首屏的「加载中」由 initialLoading 表达（骨架屏），不需要 refreshing
    await loadData({ silent: true })
    startPolling()
  })

  onBeforeUnmount(() => {
    stopPolling()
    for (const entry of pendingPushes.values()) {
      if (entry.freshTimer) clearTimeout(entry.freshTimer)
    }
    pendingPushes.clear()
  })

  return {
    initialLoading,
    refreshing,
    errorText,
    payload,
    activePlate,
    hideUnselected,
    searchText,
    sortState,
    lastUpdatedAt,
    staleSeconds,
    lastPushAt,
    realtimeStatus,
    summary,
    dataDate,
    isEmpty,
    filteredRows,
    visibleCountText,
    selectPlate,
    onSortChange,
    loadData,
    startPolling,
    stopPolling,
    /** 身份变化后重建事件流连接（query 里的 token 变了） */
    restartRealtime: socket.restart,
  }
}
