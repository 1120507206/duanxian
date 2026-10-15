// 涨停播报的展示格式化：站点页与通达信独立页共用，避免两处口径漂移。

export function formatNumber(value, digits = 2) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(digits) : '--'
}

export function formatPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '--'
  return `${number >= 0 ? '+' : ''}${number.toFixed(2)}%`
}

export function formatMoneyFromYuan(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '--'
  if (Math.abs(number) >= 100000000) return `${(number / 100000000).toFixed(2)}亿`
  return `${Math.round(number / 10000)}万`
}

export function formatMarketCap(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '--'
  if (Math.abs(number) >= 100000000000) return `${(number / 100000000000).toFixed(1)}千亿`
  return `${(number / 100000000).toFixed(1)}亿`
}

export function formatClock(value) {
  if (!value) return '--'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
