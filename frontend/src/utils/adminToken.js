/**
 * 后台会话 token 的本地存储。
 *
 * 存在 localStorage 而不是 sessionStorage：运营人员一天要开开关关很多次，
 * 每次都要重新输密码会逼着人把密码设得很短 —— 那是更差的权衡。
 * 真正的防线在服务端：token 12 小时过期，且改密码/停用会立刻作废。
 *
 * 键名与前台 token（duanxian:token）刻意不同：同一个浏览器里同时登录
 * 用户账号和后台账号是常态，用同一个键会互相覆盖。
 */
const STORAGE_KEY = 'duanxian:adminToken'

let memoryToken = ''

export function getAdminToken() {
  if (memoryToken) return memoryToken
  try {
    memoryToken = window.localStorage.getItem(STORAGE_KEY) || ''
  } catch (_) {
    // 隐私模式下 localStorage 可能不可用，退回内存存储
  }
  return memoryToken
}

export function setAdminToken(token) {
  memoryToken = String(token || '')
  try {
    if (memoryToken) window.localStorage.setItem(STORAGE_KEY, memoryToken)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch (_) {
    // 忽略：内存里已经有了
  }
}

export function clearAdminToken() {
  setAdminToken('')
}
