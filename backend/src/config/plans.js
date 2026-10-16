/**
 * 会员套餐定义（后端唯一事实来源）。
 *
 * 定价依据：同赛道打板工具价格带为 ¥98/月 ~ ¥5880/年（小刺客 3580-5880/年、
 * 舞阳量化约 600/月、淘宝类抓涨停工具 98/月-1998/年）。我们显著低于该区间，
 * 但高于最初 Landing 上的 ¥19.9/月 —— 那个价格覆盖不了服务器与运维成本，
 * 且会让用户按「廉价小工具」预期要求服务。
 *
 * 注意：`price` 只用于展示与对账，不参与任何计算（收款走第三方平台，不经过本服务）。
 */
export const PLANS = {
  month: {
    key: 'month',
    name: '月度会员',
    price: 39,
    durationDays: 30,
    codePrefix: 'DXM',
  },
  quarter: {
    key: 'quarter',
    name: '季度会员',
    price: 88,
    durationDays: 90,
    codePrefix: 'DXQ',
  },
  year: {
    key: 'year',
    name: '年度会员',
    price: 268,
    durationDays: 365,
    codePrefix: 'DXY',
  },
  // 新人礼：注册即送。不出现在定价区（purchasable=false），
  // 但要在 getPlan() 里能查到，否则到期时间旁边显示不出套餐名。
  trial: {
    key: 'trial',
    name: '新人体验会员',
    price: 0,
    durationDays: 30,
    codePrefix: 'DXT',
    purchasable: false,
  },
}

export const DEFAULT_PLAN = 'year'

/** 定价区只展示可售套餐；trial / manual 这类内部套餐不能出现在收银台 */
export function getPurchasablePlans() {
  return Object.values(PLANS).filter((plan) => plan.purchasable !== false)
}

export function getPlan(key) {
  return PLANS[key] || null
}

export function isValidPlan(key) {
  return Boolean(PLANS[key])
}
