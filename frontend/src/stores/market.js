import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  fetchHomeData, fetchLianban, fetchLonghu, fetchJingjia, fetchZijin, fetchFupanData,
} from '@/api'
import {
  mockIndices, mockSentiment,
  generateLianbanData, generateLonghuData,
  generateJingjiaData, generateZijinData, generateFupanData,
} from '@/mock/data'

export const useMarketStore = defineStore('market', () => {
  const indices = ref([...mockIndices])
  const sentiment = ref({ ...mockSentiment })
  const lianbanList = ref(generateLianbanData())
  const longhuList = ref(generateLonghuData())
  const jingjiaList = ref(generateJingjiaData())
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
      if (data.indices) indices.value = data.indices
      if (data.sentiment) sentiment.value = data.sentiment
    } catch (e) {
      console.warn('API 不可用，使用本地数据')
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
    } catch { /* fallback to mock */ }
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
    } catch { /* fallback */ }
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
    } catch { /* fallback */ }
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
    loadHome, refreshHome,
    loadLianban, refreshLianban,
    loadLonghu, refreshLonghu,
    loadJingjia, refreshJingjia,
    loadZijin, refreshZijin,
    loadFupan,
  }
})
