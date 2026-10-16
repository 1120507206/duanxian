/**
 * 通达信「独立页」链接的生成与复制。
 *
 * 独立页（ztlive.html）与主站同源但独立打包：没有侧边栏、按窄栏贴边布局，
 * 是专门给通达信自定义面板 / 插件嵌入的地址。用户要在通达信里填的就是这个地址，
 * 所以「一键复制」是这块最容易出错的一步 —— 手抄一串带域名和渠道参数的 URL 太容易错。
 */
import { buildShareUrl } from './deviceId'

/**
 * 拼出通达信独立页的完整地址。
 *
 * 域名取自当前页面（本地开发就是 http://localhost:3000/ztlive.html，线上是 https 域名），
 * 不写死配置：同一份前端产物在测试 / 生产都能给出正确链接。
 *
 * 这里**不塞兜底渠道码**：这个链接是给用户自己填进通达信、长期使用的配置地址，
 * 拖一个 ?c=share 只会让人以为是多余参数。只有用户本身带着渠道进来时（他分享出去
 * 才算延续归因），才把渠道码附上。
 *
 * @param {string} [channel] 用户自身的渠道码，为空则返回干净地址
 */
export function buildEmbedUrl(channel = '') {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return buildShareUrl(`${origin}/ztlive.html`, channel)
}

/**
 * 复制纯文本到剪贴板，带非安全上下文（http）的降级。
 *
 * 为什么不能只用 navigator.clipboard：它是安全上下文 API，通达信内核浏览器
 * 或 http 域名下常常拿不到，此时必须退回 execCommand —— 否则用户点了「复制」
 * 什么也没发生，只能自己手抄链接。
 *
 * @param {string} text
 * @returns {Promise<void>} 复制失败时 reject
 */
export async function copyPlainText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-1000px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    const ok = document.execCommand('copy')
    if (!ok) throw new Error('execCommand("copy") 返回 false')
  } finally {
    document.body.removeChild(textarea)
  }
}
