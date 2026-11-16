import crypto from 'node:crypto'

/**
 * 订单号：`DX` + 本地日期 + 6 位 base36 随机。
 *
 * 为什么不是原来的 4 位数字：
 * 一天只有 1 万种组合，按日均 100 单算，撞号概率约 40%（生日问题）。
 * 订单号有 UNIQUE 约束，撞上就是下单接口 500 —— 用户看到的是「服务不可用」，
 * 而且这种失败完全随机，最难复现。
 *
 * 6 位 base36 = 36^6 ≈ 21.8 亿种组合，日常量级下可以忽略碰撞；
 * 调用方仍然要在 UNIQUE 冲突时重试，作为兜底（见 payService.insertOrder）。
 *
 * 保持纯大写：查询侧统一 `toUpperCase()`，避免大小写导致「订单查不到」。
 */
const RANDOM_SPACE = 36 ** 6

function formatDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('')
}

/**
 * @param {Date} [date] 仅测试时传入固定日期，业务代码不要传
 * @returns {string} 例如 DX20261102K3F9QZ
 */
export function makeOrderNo(date = new Date()) {
  const suffix = crypto.randomInt(0, RANDOM_SPACE)
    .toString(36)
    .padStart(6, '0')
    .toUpperCase()

  return `DX${formatDate(date)}${suffix}`
}
