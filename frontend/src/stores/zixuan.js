import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchZixuanList, addZixuan as apiAdd, removeZixuan as apiRemove } from '@/api'

const STORAGE_KEY = 'duanxian:zixuan'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveToStorage(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export const useZixuanStore = defineStore('zixuan', () => {
  const stocks = ref(loadFromStorage())

  // 从服务端加载自选列表
  async function loadFromServer() {
    try {
      const data = await fetchZixuanList()
      if (data.list) {
        stocks.value = data.list.map((s) => ({
          code: s.code,
          name: s.name,
          addedAt: s.addedAt || Date.now(),
          price: s.price || (Math.random() * 50 + 5).toFixed(2),
          pct: s.pct || ((Math.random() - 0.4) * 8).toFixed(2),
        }))
        saveToStorage(stocks.value)
      }
    } catch {
      // 服务端不可用时使用 localStorage
    }
  }

  async function addStock(stock) {
    if (stocks.value.find((s) => s.code === stock.code)) return false
    try {
      await apiAdd(stock)
    } catch (e) {
      if (e.response?.status !== 409) {
        console.warn('服务端添加失败，仅本地保存')
      }
    }
    stocks.value.push({
      ...stock,
      addedAt: Date.now(),
      price: (Math.random() * 50 + 5).toFixed(2),
      pct: ((Math.random() - 0.4) * 8).toFixed(2),
    })
    saveToStorage(stocks.value)
    return true
  }

  async function removeStock(code) {
    try {
      await apiRemove(code)
    } catch { /* ignore */ }
    stocks.value = stocks.value.filter((s) => s.code !== code)
    saveToStorage(stocks.value)
  }

  function updatePrice(code, price, pct) {
    const s = stocks.value.find((s) => s.code === code)
    if (s) { s.price = price; s.pct = pct }
  }

  const groupedStocks = computed(() => stocks.value)

  return { stocks, groupedStocks, loadFromServer, addStock, removeStock, updatePrice }
})
