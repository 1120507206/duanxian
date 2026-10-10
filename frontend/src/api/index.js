import axios from 'axios'
import { notify } from '@/utils/notify'

const http = axios.create({
  baseURL: '/api',
  timeout: 10000,
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

export default http
