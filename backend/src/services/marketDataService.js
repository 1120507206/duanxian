import * as cache from './cacheService.js'
import * as eastMoney from './eastMoneyService.js'
import {
  transformIndices, transformLianban,
  transformLonghu, transformJingjia, transformZijin, transformFupan,
} from './dataTransformer.js'

async function getCached(key, category, fetcher) {
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const data = await fetcher()
  cache.set(key, data, category)
  return data
}

// ==================== 大盘指数 ====================
export async function getIndices() {
  return getCached('indices:all', 'indices', async () => {
    const data = await eastMoney.getIndices()
    return transformIndices(data)
  })
}

// ==================== 市场情绪 ====================
export async function getSentiment() {
  return getCached('sentiment:all', 'sentiment', async () => {
    const [upDown, limitCounts, ztStocks] = await Promise.all([
      eastMoney.getMarketUpsAndDowns(),
      eastMoney.getLimitCounts(),
      eastMoney.getLimitUpStocks(),
    ])
    const ztCount = limitCounts.ztCount || ztStocks.length
    const dtCount = limitCounts.dtCount || 0
    const lianbanHeight = await getSentimentLianbanHeight(ztStocks)
    return {
      ztCount,
      dtCount,
      ztRatio: ztCount > 0 ? Math.round(ztCount / (ztCount + dtCount || 1) * 100) : 0,
      kuiqian: 0,
      mainFlow: 0,
      lianbanHeight,
      upCount: upDown.upCount,
      downCount: upDown.downCount,
      turnover: upDown.turnover || 0,
    }
  })
}

async function getSentimentLianbanHeight(ztStocks) {
  if (!ztStocks.length) return 0

  const results = await Promise.allSettled(
    ztStocks.slice(0, 10).map(async (stock) => {
      const klines = await eastMoney.getKlineForBoard(stock.code, 12)
      if (!klines.length) return 1

      let board = 0
      for (let i = klines.length - 1; i >= 0; i -= 1) {
        const preclose = i > 0 ? klines[i - 1].close : klines[i].open
        const pct = preclose > 0 ? ((klines[i].close - preclose) / preclose) * 100 : 0
        if (pct >= 9.5) board += 1
        else break
      }
      return board || 1
    }),
  )

  return results.reduce((max, result) => {
    if (result.status !== 'fulfilled') return max
    return Math.max(max, result.value)
  }, 0)
}

// ==================== 连板 ====================
export async function getLianban() {
  return getCached('lianban:all', 'lianban', async () => {
    const stocks = await eastMoney.getLimitUpStocks()
    // 为前20只涨停股查询连板数
    const boardMap = {}
    const topStocks = stocks.slice(0, 20)
    await Promise.allSettled(
      topStocks.map(async (s) => {
        const klines = await eastMoney.getKlineForBoard(s.code, 12)
        let board = 0
        for (let i = klines.length - 1; i >= 0; i--) {
          const preclose = i > 0 ? klines[i - 1].close : klines[i].open
          const pct = (klines[i].close - preclose) / preclose * 100
          if (pct >= 9.5) board += 1
          else break
        }
        boardMap[s.code] = board || 1
      }),
    )
    return transformLianban(stocks, boardMap)
  })
}

// ==================== 龙虎榜 ====================
export async function getLonghu(date) {
  const cacheKey = `longhu:${date}`
  return getCached(cacheKey, 'longhu', async () => {
    const list = await eastMoney.getLonghu(date)
    // 获取前5只股票的买卖明细
    const detailsMap = {}
    const top5 = list.slice(0, 5)
    await Promise.allSettled(
      top5.map(async (item) => {
        const detail = await eastMoney.getLonghuDetail(item.code, date)
        detailsMap[item.code] = detail
      }),
    )
    // 为没有详情的股票填充空数据
    for (const item of list) {
      if (!detailsMap[item.code]) {
        detailsMap[item.code] = { buyList: [], sellList: [] }
      }
    }
    return transformLonghu(list, detailsMap)
  })
}

// ==================== 集合竞价 ====================
export async function getJingjia() {
  return getCached('jingjia:all', 'jingjia', async () => {
    const data = await eastMoney.getJingjiaData()
    return transformJingjia(data)
  })
}

// ==================== 资金流向 ====================
export async function getZijin() {
  return getCached('zijin:all', 'zijin', async () => {
    const [flow, leadersMap] = await Promise.all([
      eastMoney.getIndustryFlow(),
      getPlateLeadersMap(),
    ])
    return transformZijin(flow, leadersMap)
  })
}

async function getPlateLeadersMap() {
  return getCached('zijin:leaders', 'zijin', async () => {
    const flow = await eastMoney.getIndustryFlow()
    const top5 = flow.slice(0, 5)
    const map = {}
    await Promise.allSettled(
      top5.map(async (item) => {
        const leaders = await eastMoney.getPlateLeaders(item.code)
        map[item.code] = leaders
      }),
    )
    return map
  })
}

// ==================== K线 ====================
export async function getKline(code, type = 'day') {
  const cacheKey = `kline:${code}:${type}`
  return getCached(cacheKey, 'kline', () => eastMoney.getKline(code, type))
}

// ==================== 批量行情 ====================
export async function getQuotes(codes) {
  if (!codes.length) return []
  const cacheKey = `quotes:${codes.sort().join(',')}`
  return getCached(cacheKey, 'quotes', () => eastMoney.getQuotes(codes))
}

// ==================== 复盘 ====================
export async function getFupan(date) {
  const cacheKey = `fupan:${date}`
  return getCached(cacheKey, 'fupan', async () => {
    const [lianbanData] = await Promise.all([
      getLianban().catch(() => []),
    ])
    return transformFupan(date, lianbanData)
  })
}
