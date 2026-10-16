import axios from 'axios'
import { notify } from '@/utils/notify'
import { getDeviceId } from '@/utils/deviceId'
import { getSessionToken } from '@/utils/sessionToken'

const http = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

// 所有请求自动带上设备标识与会话 token。
// 放在拦截器里而不是逐个接口手动传，是为了避免以后新增接口时漏带
// —— 漏带设备标识的直接后果是会员被当成非会员，用户会以为「付了钱没生效」。
http.interceptors.request.use((config) => {
  const deviceId = getDeviceId()
  if (deviceId) config.headers['X-Device-Id'] = deviceId

  const token = getSessionToken()
  if (token) config.headers['X-Session-Token'] = token

  return config
})

const ERROR_NOTIFY_INTERVAL = 12000
const ERROR_NOTIFY_MIN_GAP = 4000
let lastErrorNotifyAt = 0
let lastErrorNotifyKey = ''

function getApiErrorMessage(err) {
  const status = err.response?.status
  const serverMessage = err.response?.data?.error

  if (serverMessage) return serverMessage
  if (err.code === 'ECONNABORTED') return '行情接口响应超时，页面会继续显示本地兜底数据'
  if (!err.response) return '后端服务连接失败，请确认后端已启动或 API 代理正常'
  if (status >= 500) return '后端服务暂时不可用，页面会继续显示本地兜底数据'
  if (status === 404) return '接口地址不存在，请检查前后端版本是否一致'
  if (status === 429) return '请求过于频繁，请稍后再试'

  return '行情数据暂时不可用，页面会继续显示本地兜底数据'
}

function shouldNotifyApiError(err) {
  if (err.config?.suppressNotify) return false

  const status = err.response?.status || err.code || 'network'
  const url = err.config?.url || 'unknown'
  const key = `${status}:${url}`
  const now = Date.now()

  if (now - lastErrorNotifyAt < ERROR_NOTIFY_MIN_GAP) {
    return false
  }

  if (key === lastErrorNotifyKey && now - lastErrorNotifyAt < ERROR_NOTIFY_INTERVAL) {
    return false
  }

  lastErrorNotifyKey = key
  lastErrorNotifyAt = now
  return true
}

http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    console.error('API Error:', err.message)
    if (shouldNotifyApiError(err)) {
      const status = err.response?.status
      notify({
        type: status >= 500 ? 'error' : 'warning',
        message: getApiErrorMessage(err),
      })
    }
    return Promise.reject(err)
  },
)

// 静默探测接口，用于状态中心，避免自检失败时连续弹出业务错误提示。
export function probeApi(path, config = {}) {
  return http.get(path, { ...config, suppressNotify: true })
}

export function fetchHealth() {
  return probeApi('/health')
}

// 涨停播报实时快照
export function fetchZtlive() {
  return http.get('/ztlive')
}

// 首页数据
export function fetchHomeData() {
  return http.get('/home')
}

// 连板排行
export function fetchLianban(params) {
  return http.get('/lianban', { params })
}

// 龙虎榜
export function fetchLonghu(params) {
  return http.get('/longhu', { params })
}

// 集合竞价
export function fetchJingjia(params) {
  return http.get('/jingjia', { params })
}

// 资金流向
export function fetchZijin(params) {
  return http.get('/zijin', { params })
}

// 自选股
export function fetchZixuanList() {
  return http.get('/zixuan')
}

export function addZixuan(stock) {
  return http.post('/zixuan', stock)
}

export function removeZixuan(code) {
  return http.delete(`/zixuan/${code}`)
}

// 复盘数据
export function fetchFupanData(date) {
  return http.get('/fupan', { params: { date } })
}

// 股票K线数据
export function fetchKline(code, type = 'day') {
  return http.get(`/kline/${code}`, { params: { type } })
}

// ========== 用户体系 / 会员 ==========

/** 建档或心跳；首次访问时把渠道码一起带上（首次归因） */
export function createUserSession(payload) {
  return http.post('/user/session', payload)
}

/** 只读查询会员状态 */
export function fetchUserStatus(deviceId) {
  return http.get('/user/status', { params: { deviceId } })
}

/** 激活码核销 */
export function activateMembership(payload) {
  return http.post('/user/activate', payload)
}

/** 套餐定义由后端下发，前端不硬编码定价 */
export function fetchPlans() {
  return probeApi('/user/plans')
}

// ========== 账户体系（手机号注册 / 登录） ==========

/** 发送短信验证码；purpose: register | login */
export function sendSmsCode(payload) {
  return http.post('/auth/sms/send', payload)
}

/** 注册（注册成功即送新人礼） */
export function registerAccount(payload) {
  return http.post('/auth/register', payload)
}

/** 密码登录 */
export function loginByPassword(payload) {
  return http.post('/auth/login', payload)
}

/** 验证码登录 */
export function loginByCode(payload) {
  return http.post('/auth/login/code', payload)
}

export function logoutAccount() {
  return http.post('/auth/logout', {}, { suppressNotify: true })
}

/** 当前登录态与权益。未登录也返回 200，靠 loggedIn 判断 */
export function fetchMe(deviceId) {
  return http.get('/auth/me', { params: { deviceId }, suppressNotify: true })
}

/** 套餐、收款方式、新人礼天数等一次性配置 */
export function fetchMemberConfig() {
  return probeApi('/auth/config')
}

/** 设置密码 */
export function setAccountPassword(password) {
  return http.post('/auth/password', { password })
}

// ========== 收款码支付 ==========

export function createPayOrder(payload) {
  return http.post('/pay/order', payload)
}

export function confirmPayOrder(orderNo, payload) {
  return http.post(`/pay/order/${encodeURIComponent(orderNo)}/confirm`, payload)
}

export function fetchPayOrder(orderNo) {
  return http.get(`/pay/order/${encodeURIComponent(orderNo)}`, { suppressNotify: true })
}

export function fetchMyOrders() {
  return http.get('/pay/orders', { suppressNotify: true })
}

/**
 * 埋点上报。
 * suppressNotify 很关键：埋点接口失败绝不能弹提示打扰用户。
 */
export function reportEvent(payload) {
  return http.post('/event', payload, { suppressNotify: true })
}

export default http
