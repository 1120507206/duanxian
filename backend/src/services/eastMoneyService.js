const PUSH_API = 'http://push2.eastmoney.com/api/qt'
const PUSH_HIS_API = 'http://push2his.eastmoney.com/api/qt'
const DATA_CENTER_API = 'http://datacenter.eastmoney.com/api/data/v1/get'
const TENCENT_QUOTE_API = 'https://qt.gtimg.cn/q='
const UT = 'bd1d9ddb04089700cf9c27f6f7426281'
import * as logger from '../utils/logger.js'

const MARKET_INDEXES = [
  { secId: '1.000001', tencentCode: 's_sh000001', fallbackName: '上证指数' },
  { secId: '0.399001', tencentCode: 's_sz399001', fallbackName: '深证成指' },
  { secId: '0.399006', tencentCode: 's_sz399006', fallbackName: '创业板指' },
  { secId: '1.000688', tencentCode: 's_sh000688', fallbackName: '科创50' },
]

function getSecId(code) {
  if (code.startsWith('6')) return `1.${code}`
  if (code.startsWith('0') || code.startsWith('3')) return `0.${code}`
  if (code.startsWith('399')) return `0.${code}`
  if (code.startsWith('000')) return `1.${code}`
  return `1.${code}`
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(8000),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      return await resp.json()
    } catch (err) {
      logger.warn('eastmoney_fetch_failed', {
        attempt: i + 1,
        retries,
        url: url.split('?')[0],
        error: err,
      })
      if (i === retries - 1) throw err
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
    }
  }
}

function isValidIndex(item) {
  return /^[0-9]{6}$/.test(String(item?.code || ''))
    && typeof item?.name === 'string'
    && item.name.trim().length > 0
    && Number.isFinite(Number(item?.value))
    && Number(item.value) > 0
    && Number.isFinite(Number(item?.pct))
    && Math.abs(Number(item.pct)) <= 20
}

async function getEastMoneyIndex(index) {
  const fields = 'f43,f57,f58,f60,f169,f170,f48'
  const url = `${PUSH_API}/stock/get?invt=2&fltt=2&fields=${fields}&secid=${index.secId}`
  const raw = await fetchWithRetry(url)
  const item = raw?.data
  const quote = {
    code: String(item?.f57 || ''),
    name: String(item?.f58 || index.fallbackName),
    value: Number(item?.f43),
    change: Number(item?.f169),
    pct: Number(item?.f170),
    preclose: Number(item?.f60),
    turnover: Number(item?.f48) / 1e8,
    source: 'eastmoney',
  }

  if (!isValidIndex(quote)) throw new Error(`指数数据校验失败: ${index.secId}`)
  return quote
}

async function getTencentIndices() {
  const codes = MARKET_INDEXES.map((index) => index.tencentCode).join(',')
  const raw = await fetchWithRetry(`${TENCENT_QUOTE_API}${codes}`)
  const lines = String(raw || '').split(';').filter(Boolean)
  const quotes = lines.map((line, position) => {
    const fields = line.match(/="(.*)"/)?.[1]?.split('~') || []
    const fallback = MARKET_INDEXES[position]
    return {
      code: String(fields[2] || ''),
      name: String(fields[1] || fallback?.fallbackName || ''),
      value: Number(fields[3]),
      change: Number(fields[4]),
      pct: Number(fields[5]),
      preclose: Number(fields[3]) - Number(fields[4]),
      turnover: Number(fields[7]) / 1e8,
      source: 'tencent',
    }
  })

  if (quotes.length !== MARKET_INDEXES.length || quotes.some((quote) => !isValidIndex(quote))) {
    throw new Error('腾讯指数数据校验失败')
  }
  return quotes
}

// ==================== 大盘指数 ====================
export async function getIndices() {
  const primary = await Promise.allSettled(MARKET_INDEXES.map(getEastMoneyIndex))
  const quotes = primary
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)

  if (quotes.length === MARKET_INDEXES.length) return quotes

  logger.warn('eastmoney_index_fallback', {
    validCount: quotes.length,
    expectedCount: MARKET_INDEXES.length,
  })
  return getTencentIndices()
}

// ==================== 市场情绪 ====================
export async function getMarketBreadth() {
  const fs = 'm:0+t:6+f:!50,m:0+t:80+f:!50,m:1+t:2+f:!50,m:1+t:23+f:!50'
  const url = `${PUSH_API}/clist/get?fltt=2&invt=2&ut=${UT}&fs=${encodeURIComponent(fs)}&fields=f12,f3&pn=1&pz=10000&po=0&np=1`
  const raw = await fetchWithRetry(url)
  if (!raw?.data?.diff) return { upCount: 0, downCount: 0, ztCount: 0, dtCount: 0 }

  let upCount = 0
  let downCount = 0
  let ztCount = 0
  let dtCount = 0
  for (const item of raw.data.diff) {
    const pct = Number(item.f3)
    if (!Number.isFinite(pct)) continue
    if (pct > 0) upCount += 1
    if (pct < 0) downCount += 1
    if (pct >= 9.5) ztCount += 1
    if (pct <= -9.5) dtCount += 1
  }
  return { upCount, downCount, ztCount, dtCount }
}

// ==================== 连板/涨停股 ====================
export async function getLimitUpStocks() {
  const url = `${PUSH_API}/clist/get?fltt=2&invt=2&ut=${UT}&fs=b:ZT0&fields=f12,f14,f2,f3,f8,f20,f21,f6,f15,f4,f100&pn=1&pz=200&po=0&np=1&fid=f3`
  const raw = await fetchWithRetry(url)
  if (!raw?.data?.diff) return []
  return raw.data.diff.map((item) => ({
    code: item.f12,
    name: item.f14,
    price: item.f2 || 0,
    pct: item.f3 || 0,
    turnoverRate: item.f8 || 0,
    marketVal: (item.f20 || 0) / 1e8,
    turnover: (item.f6 || 0) / 1e8,
    volume: item.f15 || 0,
    open: item.f17 || 0,
    industry: item.f100 || '',
  }))
}

// 获取单只股票K线用于计算连板数
export async function getKlineForBoard(code, limit = 15) {
  const secId = getSecId(code)
  const url = `${PUSH_HIS_API}/stock/kline/get?secid=${secId}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=101&fqt=1&end=20500101&lmt=${limit}`
  const raw = await fetchWithRetry(url)
  if (!raw?.data?.klines) return []
  return raw.data.klines.map((line) => {
    const [time, open, close, high, low, volume, amount] = line.split(',')
    return { time, open: +open, close: +close, high: +high, low: +low, volume: +volume, amount: +amount }
  })
}

// ==================== 龙虎榜 ====================
export async function getLonghu(date) {
  const dateStr = date.replace(/-/g, '')
  const url = `${DATA_CENTER_API}?reportName=RPT_DAILYBILLBOARD&columns=ALL&pageNumber=1&pageSize=100&sortTypes=-1&sortColumns=NETBUYAMT&source=WEB&client=WEB&filter=(TRADE_DATE='${dateStr}')`
  const raw = await fetchWithRetry(url)
  if (!raw?.result?.data) return []
  return raw.result.data.map((item) => ({
    code: item.SECURITY_CODE,
    name: item.SECURITY_NAME_ABBR,
    reason: item.EXPLAIN || '',
    price: item.CLOSE_PRICE || 0,
    pct: item.CHANGE_RATIO || 0,
    turnover: item.TURNOVERRATE || 0,
    buyTotal: item.BUY_AMT || 0,
    sellTotal: item.SELL_AMT || 0,
    netFlow: item.NETBUYAMT || 0,
  }))
}

export async function getLonghuDetail(code, date) {
  const dateStr = date.replace(/-/g, '')
  const url = `${DATA_CENTER_API}?reportName=RPT_BILLBOARD_DETAILS&columns=ALL&pageNumber=1&pageSize=100&source=WEB&client=WEB&filter=(TRADE_DATE='${dateStr}')(SECURITY_CODE='${code}')&sortTypes=-1&sortColumns=BUYAMT`
  const raw = await fetchWithRetry(url)
  if (!raw?.result?.data) return { buyList: [], sellList: [] }
  const buyList = []
  const sellList = []
  for (const item of raw.result.data) {
    const entry = {
      name: item.BUYER_DEPT_NAME || '',
      amount: item.BUYAMT || 0,
      dept: item.BUYER_DEPT_NAME || '',
    }
    if ((item.BUYAMT || 0) > 0) buyList.push(entry)
    if ((item.SELLAMT || 0) > 0) {
      sellList.push({ ...entry, amount: item.SELLAMT })
    }
  }
  return { buyList, sellList }
}

// ==================== 集合竞价数据 ====================
export async function getJingjiaData() {
  const fs = 'm:0+t:6+f:!50,m:0+t:80+f:!50,m:1+t:2+f:!50,m:1+t:23+f:!50'
  const url = `${PUSH_API}/clist/get?fltt=2&invt=2&ut=${UT}&fs=${encodeURIComponent(fs)}&fields=f12,f14,f2,f3,f17,f18,f15,f20,f8,f100&pn=1&pz=100&po=0&np=1&fid=f3`
  const raw = await fetchWithRetry(url)
  if (!raw?.data?.diff) return []
  return raw.data.diff
    .filter((item) => Math.abs(item.f3 || 0) >= 3)
    .map((item) => {
      const preclose = item.f18 || 1
      const jjPct = preclose > 0 ? ((item.f17 - preclose) / preclose * 100) : 0
      return {
        code: item.f12,
        name: item.f14,
        jjPct: +jjPct.toFixed(2),
        jjAmount: ((item.f17 || 0) * (item.f15 || 0) / 1e8).toFixed(2),
        openPct: item.f3 || 0,
        price: item.f2 || 0,
        volume: item.f15 || 0,
        ztBoard: item.f3 >= 9.8 ? 1 : 0,
        industry: item.f100 || '',
      }
    })
}

// ==================== 资金流向（行业板块） ====================
export async function getIndustryFlow() {
  const url = `${PUSH_API}/clist/get?fltt=2&invt=2&ut=${UT}&fs=m:90+t:2&fields=f12,f14,f2,f3,f62,f184,f66,f72,f78,f152&pn=1&pz=50&po=0&np=1&fid=f62`
  const raw = await fetchWithRetry(url)
  if (!raw?.data?.diff) return []
  return raw.data.diff.map((item) => ({
    code: item.f12,
    name: item.f14,
    mainIn: (item.f62 || 0) / 1e8,
    superIn: (item.f184 || 0) / 1e8,
    largeIn: (item.f66 || 0) / 1e8,
    mediumIn: (item.f72 || 0) / 1e8,
    smallIn: (item.f78 || 0) / 1e8,
    totalIn: ((item.f62 || 0) + (item.f184 || 0)) / 1e8,
    pct: item.f3 || 0,
    flow5d: (item.f152 || 0) / 1e8,
  }))
}

// 获取板块领涨股
export async function getPlateLeaders(plateCode) {
  const url = `${PUSH_API}/clist/get?fltt=2&invt=2&ut=${UT}&fs=b:BK${plateCode}&fields=f12,f14,f2,f3&pn=1&pz=5&po=0&np=1&fid=f3`
  const raw = await fetchWithRetry(url)
  if (!raw?.data?.diff) return []
  return raw.data.diff.slice(0, 3).map((item) => ({
    code: item.f12,
    name: item.f14,
    pct: item.f3 || 0,
    flow: 0,
  }))
}

// ==================== K线 ====================
export async function getKline(code, type = 'day', limit = 200) {
  const secId = getSecId(code)
  const klt = type === 'week' ? 102 : type === 'month' ? 103 : 101
  const url = `${PUSH_HIS_API}/stock/kline/get?secid=${secId}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=${klt}&fqt=1&end=20500101&lmt=${limit}`
  const raw = await fetchWithRetry(url)
  if (!raw?.data?.klines) return { code, type, data: [] }
  const data = raw.data.klines.map((line) => {
    const [time, open, close, high, low, volume, amount] = line.split(',')
    return { time, open: +open, close: +close, high: +high, low: +low, volume: +volume }
  })
  return { code, type, data }
}

// ==================== 批量实时行情 ====================
export async function getQuotes(codes) {
  if (!codes.length) return []
  const secids = codes.map(getSecId).join(',')
  const url = `${PUSH_API}/ulist.np/get?fltt=2&secids=${secids}&fields=f12,f14,f2,f3,f4,f15,f16,f17,f18,f20,f21`
  const raw = await fetchWithRetry(url)
  if (!raw?.data?.diff) return []
  return raw.data.diff.map((item) => ({
    code: item.f12,
    name: item.f14,
    price: item.f2 || 0,
    pct: item.f3 || 0,
    open: item.f17 || 0,
    preclose: item.f18 || 0,
    high: item.f15 || 0,
    low: item.f16 || 0,
    marketVal: (item.f20 || 0) / 1e8,
  }))
}
