/**
 * 会话 token 的本地存储。
 *
 * 用 localStorage 而不是 cookie：涨停播报要嵌进通达信的内核浏览器，
 * 那类环境对 cookie 的支持很不一致（有的直接禁用），而 localStorage 基本都能用。
 * 后端读取的是 X-Session-Token 头，不依赖 cookie，所以这边怎么存都不影响鉴权。
 *
 * 单独抽一个文件，是为了让 api 拦截器能直接同步读取（axios 拦截器里不好用 Pinia，
 * 会引入 store 初始化顺序问题）。store 只做镜像，方便组件响应式使用。
 */
const TOKEN_KEY = 'duanxian:token'

export function getSessionToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch (_) {
    return ''
  }
}

export function setSessionToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch (_) {
    // 隐私模式下 localStorage 可能不可写：此时 token 只在内存里，
    // 刷新后需要重新登录 —— 比直接崩掉好
  }
}

export function clearSessionToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch (_) {
    /* 忽略 */
  }
}
