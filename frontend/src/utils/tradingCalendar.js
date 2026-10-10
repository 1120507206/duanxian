const HOLIDAYS = new Set([
  '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31',
  '2025-02-03', '2025-02-04', '2025-04-04', '2025-04-05', '2025-04-06',
  '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05',
  '2025-05-31', '2025-06-01', '2025-06-02', '2025-09-15', '2025-09-16',
  '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04', '2025-10-05',
  '2025-10-06', '2025-10-07', '2025-10-08',
  '2026-01-01', '2026-01-02',
  '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-05', '2026-04-06', '2026-04-07',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-20', '2026-06-21', '2026-06-22',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
])

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isTradingDay(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()

  if (day === 0 || day === 6) return false

  return !HOLIDAYS.has(formatDate(d))
}

export function isTradingTime(date = new Date()) {
  if (!isTradingDay(date)) return false

  const time = date.getHours() * 100 + date.getMinutes()
  return (time >= 915 && time <= 1130) || (time >= 1300 && time <= 1500)
}

export function getMarketStatusText(date = new Date()) {
  if (isTradingTime(date)) return '盘中'
  if (isTradingDay(date)) return '休市'
  return '非交易日'
}
