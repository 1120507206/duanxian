/**
 * 后台接口封装。
 *
 * 单独建一个 axios 实例，而不是共用 api/index.js 里那个，有三个原因：
 *   1. 鉴权头不同（X-Admin-Token），共用会让拦截器逻辑变成一堆 if；
 *   2. 那个实例会带上设备 ID 与前台 token，后台请求没必要带；
 *   3. 那个实例的响应拦截器会自动弹全局错误提示，而后台页面的报错
 *      需要展示在表单里（比如「用户名或密码不正确」），不该弹 toast。
 */
import axios from 'axios'
import { getAdminToken, clearAdminToken } from '@/utils/adminToken'

const http = axios.create({
  baseURL: '/api/admin',
  timeout: 20000,
})

http.interceptors.request.use((config) => {
  const token = getAdminToken()
  if (token) config.headers['X-Admin-Token'] = token
  return config
})

http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    // 401 说明后台会话已失效。这里只清本地 token，跳转交给路由层，
    // 避免在拦截器里直接操作 router 造成的循环依赖。
    if (err.response?.status === 401) {
      clearAdminToken()
    }
    return Promise.reject(err)
  },
)

/** 统一取错误文案：后台的报错都是给人看的，直接透传服务端消息 */
export function adminErrorMessage(err, fallback = '操作失败') {
  return err?.response?.data?.error || err?.message || fallback
}

/** 服务端返回的机器可读错误码，用于区分「未初始化」这类需要特殊引导的情况 */
export function adminErrorCode(err) {
  return err?.response?.data?.code || ''
}

export function adminLogin(payload) {
  return http.post('/login', payload)
}

export function adminLogout() {
  return http.post('/logout')
}

export function adminMe() {
  return http.get('/me')
}

export function fetchAdminMeta() {
  return http.get('/meta')
}

export function fetchOverview(params) {
  return http.get('/overview', { params })
}

export function fetchAccounts(params) {
  return http.get('/accounts', { params })
}

export function fetchAccountDetail(id) {
  return http.get(`/accounts/${id}`)
}

export function grantMembership(id, payload) {
  return http.post(`/accounts/${id}/grant`, payload)
}

export function resetAccountPassword(id, payload) {
  return http.post(`/accounts/${id}/password`, payload)
}

export function setAccountStatus(id, payload) {
  return http.post(`/accounts/${id}/status`, payload)
}

export function fetchOrders(params) {
  return http.get('/orders', { params })
}

export function approveOrder(orderNo, payload) {
  return http.post(`/orders/${encodeURIComponent(orderNo)}/approve`, payload)
}

export function rejectOrder(orderNo, payload) {
  return http.post(`/orders/${encodeURIComponent(orderNo)}/reject`, payload)
}

export function fetchCodes(params) {
  return http.get('/codes', { params })
}

export function exportCodes(params) {
  return http.get('/codes/export', { params })
}

export function generateCodes(payload) {
  return http.post('/codes/generate', payload)
}

export function voidCode(code) {
  return http.post(`/codes/${encodeURIComponent(code)}/void`)
}

export function rebindCode(code, payload) {
  return http.post(`/codes/${encodeURIComponent(code)}/rebind`, payload)
}

export function fetchLogs(params) {
  return http.get('/logs', { params })
}

export default http
