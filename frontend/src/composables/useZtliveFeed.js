import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchZtlive } from '@/api'

// 上游快照文件约每 3 秒重写一次，前端按 3 秒轮询即可（与站点页/独立页共用同一节奏）。
export const ZTLIVE_REFRESH_INTERVAL = 3000

/** 超过这个秒数没有成功拿到数据，页面会提示「数据可能滞后」 */
export const ZTLIVE_STALE_WARN_SECONDS = 30

/**
 * 页面处于后台时的轮询间隔。
 *
 * 后台**不能停轮询**：语音播报的事件源就是这次轮询，停掉就等于把页面静音。
 * 但隐藏页的定时器会被浏览器节流（Chrome：隐藏后最快 ~1 秒一次，隐藏满 5 分钟降到约 1 分钟一次），
 * 所以这里只降频、不停止，后台能出声但及时性不如前台；要做到后台也准点，只能接 WebSocket（网络事件不受定时器节流影响）。
 */
const HIDDEN_REFRESH_INTERVAL = 10000

const NUMERIC_SORT_PROPS = new Set([
  'pct', 'auctionPct', 'boardNumber', 'price', 'sealAmount', 'amount', 'turnoverRate', 'floatMarketCap',
])

function sortableValue(row, prop) {
  if (NUMERIC_SORT_PROPS.has(prop)) return Number(row[prop])
  return row[prop] ?? ''
}

/**
 * 涨停播报数据源：轮询快照 + 板块/搜索筛选 + 排序。
 * 站点页（views/Ztlive.vue）和通达信独立页（views/ZtliveEmbed.vue）共用同一份口径。
 *
 * @param {object} [options]
 * @param {number} [options.refreshInterval] 轮询间隔，默认 3 秒（上游快照约 3 秒重写一次）
 * @param {(list: object[]) => void} [options.onSnapshot] 每次拿到快照后回调（含首屏），供语音播报做增量对比
 */
export function useZtliveFeed({ refreshInterval = ZTLIVE_REFRESH_INTERVAL, onSnapshot } = {}) {
  const initialLoading = ref(true)
  const refreshing = ref(false)
  const errorText = ref('')
  const payload = ref({ date: '--', list: [], plates: [], summary: null })
  const activePlate = ref('')
  const hideUnselected = ref(false)
  const searchText = ref('')
  const sortState = ref({ prop: 'firstTime', order: 'descending' })
  const lastUpdatedAt = ref('')
  const staleSeconds = ref(0)
  let timerId = null
  let staleTimerId = null
  let lastPollAt = 0

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

  function selectPlate(name) {
    activePlate.value = activePlate.value === name ? '' : name
  }

  function onSortChange({ prop, order }) {
    sortState.value = { prop, order }
  }

  async function loadData({ manual = false } = {}) {
    if (refreshing.value) return
    refreshing.value = true
    errorText.value = ''

    try {
      const next = await fetchZtlive()
      payload.value = {
        date: next?.date || '--',
        list: Array.isArray(next?.list) ? next.list : [],
        plates: Array.isArray(next?.plates) ? next.plates : [],
        summary: next?.summary || null,
      }
      lastUpdatedAt.value = next?.timestamp || new Date().toISOString()
      if (typeof onSnapshot === 'function') onSnapshot(payload.value.list)
    } catch (error) {
      errorText.value = error.response?.data?.error || '涨停播报暂时无法加载，请检查后端和数据源连接'
      if (manual) ElMessage.error(errorText.value)
    } finally {
      initialLoading.value = false
      refreshing.value = false
    }
  }

  /** 从后台切回前台时立刻补一次，避免「切回来还要等一整个轮询周期」 */
  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      lastPollAt = Date.now()
      loadData()
    }
  }

  function pollTick() {
    const hidden = document.visibilityState !== 'visible'
    const now = Date.now()
    if (hidden && now - lastPollAt < HIDDEN_REFRESH_INTERVAL) return
    lastPollAt = now
    loadData()
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
    await loadData()
    startPolling()
  })

  onBeforeUnmount(stopPolling)

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
  }
}

