/**
 * 收款方式配置：个人微信 / 支付宝收款码。
 *
 * 这条路的特征（先说清楚代价，别等出了问题才发现）：
 * - 个人收款码**没有支付回调**，所以无法自动开通，必须你核对账单后手动放行。
 * - 微信对个人码的经营性收款有风控，金额频繁、笔数多了可能被限制甚至冻结，
 *   所以它只是「今天就能收第一笔钱」的过渡方案，有执照后应尽快切商户号。
 * - 因此订单表保留人工核销入口（member approve），并且默认不开自动开通。
 *
 * 收款码图片放 `frontend/public/pay/`（前端构建产物里，可直接被访问）。
 * 用环境变量可覆盖成任意 URL（比如图床、公众号文章里的图片）。
 */
export const PAY_METHODS = {
  wx: {
    key: 'wx',
    name: '微信',
    qrUrl: process.env.PAY_WX_QR_URL || '/pay/wx.png',
    // 微信个人收款码付款时**不能填备注**，所以对账只能靠金额尾数 + 时间
    supportNote: false,
    payee: process.env.PAY_WX_PAYEE || '',
  },
  alipay: {
    key: 'alipay',
    name: '支付宝',
    qrUrl: process.env.PAY_ALIPAY_QR_URL || '/pay/alipay.png',
    // 支付宝付款时可以填备注，让用户把订单号填进去，对账最快
    supportNote: true,
    payee: process.env.PAY_ALIPAY_PAYEE || '',
  },
}

export function getPayMethod(key) {
  return PAY_METHODS[key] || null
}

export function listPayMethods() {
  return Object.values(PAY_METHODS)
}

/**
 * 是否开启「用户点已付款即自动开通」。
 *
 * 默认关闭：个人收款码没有回调，"已付款"只是用户的一面之词。
 * 真要开，只建议在你已经人工核对过、或订单量上来之后接了真实回调再开。
 */
export function autoApproveEnabled() {
  return String(process.env.PAY_AUTO_APPROVE || '') === '1'
}

/** 客服兜底：收款码没配好、或者用户不会付款时，至少有条路 */
export const PAY_CONTACT = process.env.PAY_CONTACT || ''

/** 订单未付款自动过期时长 */
export const ORDER_TTL_MS = 2 * 60 * 60 * 1000
