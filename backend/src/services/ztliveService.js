import config from '../config/index.js'
import * as cache from './cacheService.js'
import * as logger from '../utils/logger.js'

const REQUEST_TIMEOUT_MS = 8000
const RETRIES = 2
const CACHE_KEY = 'ztlive:all'
// 上游快照约每 3 秒重写一次；窗口给 1.5 秒就够，先前的 5 秒会和前端 5 秒轮询叠乘成 ~10 秒的滞后。
const FRESH_WINDOW_MS = 1500

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function toText(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function formatMoney(value) {
  const number = toNumber(value, NaN)
  if (!Number.isFinite(number)) return '--'
  if (Math.abs(number) >= 100000000) return `${(number / 100000000).toFixed(2)}亿`
  return `${Math.round(number / 10000)}万`
}

function getBoardNumber(boardLabel, lianban) {
  const explicit = toNumber(lianban, 0)
  if (explicit > 0) return explicit
  if (boardLabel === '首板') return 1

  const matched = String(boardLabel).match(/(\d+)板/)
  return matched ? Number(matched[1]) : 0
}

// 上游有两种形态：成功 {result:'success',list,date} 与正常空态 {code:0,msg:'待开盘',date}。
// 其余一律抛出，否则页面会把上游故障渲染成"0 家涨停"。
function assertUpstreamOk(data) {
  if (!data || typeof data !== 'object') throw new Error('涨停播报数据源返回格式异常')

  if (data.result === 'success') {
    if (!Array.isArray(data.list)) throw new Error('涨停播报数据源缺少 list 字段')
    return
  }

  if (typeof data.result === 'string') {
    throw new Error(data.message || `涨停播报数据源返回失败: ${data.result}`)
  }

  if (data.code === 0) return

  throw new Error(data.msg || data.message || `涨停播报数据源返回异常: code=${data.code}`)
}

async function fetchSnapshot() {
  let lastError

  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(config.ztliveSourceUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 DuanXianXia/1.0',
        },
        signal: controller.signal,
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      assertUpstreamOk(data)
      return data
    } catch (error) {
      lastError = error
      logger.warn('ztlive_source_failed', {
        attempt,
        retries: RETRIES,
        url: config.ztliveSourceUrl,
        error,
      })
      if (attempt < RETRIES) await new Promise((resolve) => setTimeout(resolve, 400))
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError || new Error('涨停播报数据源不可用')
}

function normalizeRow(item, index) {
  const fund = toNumber(item?.fund, 0)
  const isBlown = toNumber(item?.zhaban, 0) > 0 || fund <= 0
  const boardLabel = toText(item?.bannum || item?.zt || item?.ztnum, '--')
  const lianban = toNumber(item?.lianban, 0)

  return {
    id: `${toText(item?.code, 'unknown')}-${index}`,
    code: toText(item?.code, '--'),
    name: toText(item?.name, '--'),
    status: isBlown ? '炸板' : '涨停',
    board: boardLabel,
    boardNumber: getBoardNumber(boardLabel, lianban),
    price: toNumber(item?.price, 0),
    pct: toNumber(item?.zf, 0),
    auctionPct: toNumber(item?.jjzf, 0),
    sealAmount: fund,
    sealAmountText: isBlown ? '--' : formatMoney(fund),
    amount: toNumber(item?.amount, 0),
    amountText: formatMoney(item?.amount),
    firstTime: toText(item?.ftime, '--'),
    endTime: toText(item?.etime, '--'),
    turnoverRate: toNumber(item?.realhs, 0),
    floatMarketCap: toNumber(item?.realsz, 0),
    plate: toText(item?.plate || item?.concept || item?.ztyy, '其他'),
    topic: toText(item?.ztyy || item?.concept, '--'),
    convertibleBond: item?.zhai || null,
  }
}

function buildPlateStats(rows) {
  const stats = new Map()

  rows.forEach((row) => {
    const current = stats.get(row.plate) || { name: row.plate, count: 0, blown: 0 }
    if (row.status === '炸板') current.blown += 1
    else current.count += 1
    stats.set(row.plate, current)
  })

  return [...stats.values()].sort((a, b) => b.count - a.count || b.blown - a.blown)
}

export async function getZtlive() {
  const raw = await fetchSnapshot()
  const sourceRows = Array.isArray(raw?.list) ? raw.list : []
  const list = sourceRows.map(normalizeRow)
  const sealed = list.filter((row) => row.status === '涨停').length
  const blown = list.length - sealed
  const maxBoard = list.reduce((max, row) => Math.max(max, row.boardNumber), 0)

  return {
    date: toText(raw?.date, new Date().toISOString().slice(0, 10)),
    timestamp: new Date().toISOString(),
    list,
    plates: buildPlateStats(list),
    summary: {
      total: list.length,
      sealed,
      blown,
      sealRate: list.length ? Math.round(sealed / list.length * 100) : 0,
      maxBoard,
    },
  }
}

let pending = null

function loadSnapshot() {
  if (!pending) {
    pending = getZtlive()
      .then((data) => {
        cache.set(CACHE_KEY, { data, fetchedAt: Date.now() }, 'ztlive')
        return data
      })
      .finally(() => {
        pending = null
      })
  }
  return pending
}

export async function getZtliveCached() {
  const entry = cache.get(CACHE_KEY)

  if (entry && Date.now() - entry.fetchedAt < FRESH_WINDOW_MS) return entry.data

  // 过期时**等这次抓取**再返回，而不是「先回旧数据、后台再刷新」——
  // 后者会让每个前端轮询都固定晚一轮，页面上就是「永远比数据源慢一拍」。
  // loadSnapshot 内部单飞：并发请求共享同一次上游抓取，不会放大请求量。
  try {
    return await loadSnapshot()
  } catch (error) {
    if (entry) {
      // 上游临时抽风时宁可给一份带时间戳的旧快照，也不要把页面打成错误页。
      logger.warn('ztlive_refresh_failed_serving_stale', { error })
      return entry.data
    }
    throw error
  }
}
