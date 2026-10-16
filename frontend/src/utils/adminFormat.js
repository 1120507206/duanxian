/** 后台页面共用的一点点格式化，避免每个页面各写一份 */
import dayjs from 'dayjs'

/** 2026-10-16 14:03 */
export function formatTime(ms) {
  if (!ms) return '-'
  return dayjs(Number(ms)).format('YYYY-MM-DD HH:mm')
}

/** 2026-10-16 */
export function formatDate(ms) {
  if (!ms) return '-'
  return dayjs(Number(ms)).format('YYYY-MM-DD')
}

/** 带秒的完整时间，审计日志用 */
export function formatFullTime(ms) {
  if (!ms) return '-'
  return dayjs(Number(ms)).format('YYYY-MM-DD HH:mm:ss')
}

/** 「3 分钟前」这类相对时间，列表里比绝对时间更容易扫 */
export function fromNow(ms) {
  if (!ms) return '-'
  const diff = Date.now() - Number(ms)
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 30 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)} 天前`
  return formatDate(ms)
}

export function formatMoney(value) {
  const num = Number(value || 0)
  return `¥${num.toFixed(2)}`
}

/**
 * 金额尾数（如 .03）。同一套餐的多笔订单金额完全一样，
 * 个人收款码账单里只能靠这个尾数区分是哪一单 —— 所以它在后台处处都要展示。
 */
export function formatTail(amount) {
  const cents = Math.round((Number(amount) || 0) * 100) % 100
  return `.${String(cents).padStart(2, '0')}`
}

/** 手机号中间四位打码，用于日志/表格里的次要位置 */
export function maskPhone(phone) {
  const value = String(phone || '')
  if (value.length !== 11) return value
  return `${value.slice(0, 3)}****${value.slice(7)}`
}

export const ORDER_STATUS_TEXT = {
  pending: '等待付款',
  confirming: '待核对',
  paid: '已开通',
  rejected: '未通过',
  expired: '已过期',
}

/** Element Plus 的 tag 类型映射；「待核对」用 warning 是因为它需要人动手 */
export const ORDER_STATUS_TAG = {
  pending: 'info',
  confirming: 'warning',
  paid: 'success',
  rejected: 'danger',
  expired: 'info',
}

export const CODE_STATUS_TEXT = {
  unused: '未使用',
  used: '已使用',
  void: '已作废',
}

export const CODE_STATUS_TAG = {
  unused: 'success',
  used: 'info',
  void: 'danger',
}
