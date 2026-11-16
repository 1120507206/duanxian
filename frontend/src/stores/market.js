import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  fetchHomeData, fetchLianban, fetchLonghu, fetchJingjia, fetchZijin, fetchFupanData,
} from '@/api'
import {
  generateZijinData, generateFupanData,
} from '@/mock/data'

export const useMarketStore = defineStore('market', () => {
  /**
   * 首页数据**不再用 mock 兜底**。
   *
   * 之前 indices / sentiment 的初始值是 mockIndices / mockSentiment，接口失败时
   * 页面会把假指数当成真行情展示。首页虽然是隐藏入口，但直达链接和旧书签仍会进来，
   * 展示编造的指数点位比展示「数据不可用」危险得多。
   *
   * 资金流向 / 复盘仍在用 mock（不在首页展示），留到下一批统一处理。
   */
  const indices = ref([])
  const sentiment = ref({
    ztCount: 0,
    dtCount: 0,
    ztRatio: 0,
    kuiqian: 0,
    mainFlow: 0,
    lianbanHeight: 0,
    upCount: 0,
    downCount: 0,
    turnover: 0,
  })
  const homeError = ref('')
  const homeDegraded = ref(false)
  /** 是否成功拿到过情绪数据：决定首页数字区渲染数值还是「暂不可用」 */
  const sentimentReady = ref(false)
  const homeUpdatedAt = ref(0)
  /**
   * 首页用到的列表同样不再预填 mock。
   *
   * 之前一进首页就能看到「连板梯队 / 龙虎榜 / 竞价异动」，其实全是本地生成的假数据，
   * 接口失败时还会一直留着。空列表 + 「暂无数据」至少不会误导。
   *
   * 资金流向和复盘仍在用 mock（不在首页展示），留到下一批统一处理。
   */
  const lianbanList = ref([])
  const longhuList = ref([])
  const jingjiaList = ref([])
  const zijinList = ref(generateZijinData())
  const fupanData = ref(generateFupanData())
  const loading = ref(false)

  const lianbanGroups = computed(() => {
    const groups = {}
    lianbanList.value.forEach((item) => {
      const key = `${item.board}板`
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    })
    return groups
  })

  // ========== 首页数据 ==========
  async function loadHome() {
    loading.value = true
    try {
      const data = await fetchHomeData()
      indices.value = Array.isArray(data.indices) ? data.indices : []
      if (data.sentiment) {
        sentiment.value = data.sentiment
        sentimentReady.value = true
      }
      homeDegraded.value = Boolean(data.degraded)
      homeError.value = ''
      homeUpdatedAt.value = Date.now()
    } catch (error) {
      // 保留上一次成功的数据，只把「这次没拿到」如实标出来；
      // 直接清空会让用户以为行情归零。
      homeError.value = error.response?.data?.error || '行情数据暂时不可用'
      homeDegraded.value = true
    } finally {
      loading.value = false
    }
  }

  async function refreshHome() {
    await loadHome()
  }

  // ========== 连板数据 ==========
  async function loadLianban() {
    try {
      const data = await fetchLianban()
      if (data.list?.length) lianbanList.value = data.list
    } catch { /* 拿不到就保持空列表，不再塞 mock */ }
  }

  async function refreshLianban() {
    loading.value = true
    await loadLianban()
    loading.value = false
  }

  // ========== 龙虎榜 ==========
  async function loadLonghu() {
    try {
      const data = await fetchLonghu()
      if (data.list?.length) longhuList.value = data.list
    } catch { /* 保持空列表，不再塞 mock */ }
  }

  async function refreshLonghu() {
    loading.value = true
    await loadLonghu()
    loading.value = false
  }

  // ========== 集合竞价 ==========
  async function loadJingjia() {
    try {
      const data = await fetchJingjia()
      if (data.list?.length) jingjiaList.value = data.list
    } catch { /* 保持空列表，不再塞 mock */ }
  }

  async function refreshJingjia() {
    loading.value = true
    await loadJingjia()
    loading.value = false
  }

  // ========== 资金流向 ==========
  async function loadZijin() {
    try {
      const data = await fetchZijin()
      if (data.list?.length) zijinList.value = data.list
    } catch { /* fallback */ }
  }

  async function refreshZijin() {
    loading.value = true
    await loadZijin()
    loading.value = false
  }

  // ========== 复盘 ==========
  async function loadFupan(date) {
    loading.value = true
    try {
      const data = await fetchFupanData(date)
      if (data.date) fupanData.value = data
      else fupanData.value = generateFupanData(date)
    } catch {
      fupanData.value = generateFupanData(date)
    } finally {
      loading.value = false
    }
  }

  return {
    indices, sentiment, lianbanList, lianbanGroups,
    longhuList, jingjiaList, zijinList, fupanData, loading,
    homeError, homeDegraded, sentimentReady, homeUpdatedAt,
    loadHome, refreshHome,
    loadLianban, refreshLianban,
    loadLonghu, refreshLonghu,
    loadJingjia, refreshJingjia,
    loadZijin, refreshZijin,
    loadFupan,
  }
})
