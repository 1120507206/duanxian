import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchZixuanList, addZixuan as apiAdd, removeZixuan as apiRemove } from '@/api'

const STORAGE_KEY = 'duanxian:zixuan'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []

    // 旧版本会把随机生成的价格一起写进 localStorage。这里只恢复「自选关系」，
    // 价格一律丢弃 —— 没有服务端确认过的行情，不能当缓存继续展示。
    return parsed.map((s) => ({
      code: s.code,
      name: s.name,
      addedAt: s.addedAt || Date.now(),
      price: null,
      pct: null,
      quoteAvailable: false,
    }))
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
          // 行情拿不到就是 null：以前这里用 Math.random() 补一个价格，
          // 等于把假行情画进自选卡片，用户会当真。
          price: s.price ?? null,
          pct: s.pct ?? null,
          quoteAvailable: Boolean(s.quoteAvailable),
        }))
        saveToStorage(stocks.value)
      }
    } catch {
      // 服务端不可用时只用 localStorage 里的自选关系，价格保持空（显示 --）
    }
  }

  async function addStock(stock) {
    if (stocks.value.find((s) => s.code === stock.code)) return false

    let onServer
    try {
      await apiAdd(stock)
      onServer = true
    } catch (e) {
      // 409 = 服务端已有（换设备 / 历史数据），同样按成功处理
      onServer = e.response?.status === 409
      if (!onServer) console.warn('服务端添加失败，仅本地保存')
    }

    // 先落本地，保证「添加成功」后立刻能看到这张卡；行情等下一次 loadFromServer 补齐
    stocks.value.push({
      ...stock,
      addedAt: Date.now(),
      price: null,
      pct: null,
      quoteAvailable: false,
    })
    saveToStorage(stocks.value)

    if (onServer) await loadFromServer()
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
