import config from '../config/index.js'
import * as logger from '../utils/logger.js'

const REQUEST_TIMEOUT_MS = 8000
const RETRIES = 2

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
      if (data?.result && data.result !== 'success') {
        throw new Error(data.message || '涨停播报数据源返回失败')
      }
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
