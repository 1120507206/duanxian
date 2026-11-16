/**
 * Element Plus 按需装载。
 *
 * 落地页（`/`）是纯营销页，只需要几个图标和一个 toast，却因为 main.js 里
 * `app.use(ElementPlus)` 被强制下载 1.1MB JS + 348KB CSS，移动端首屏因此很慢。
 *
 * 现在把 EP 的安装推迟到「第一次进入非落地页」：
 *   · router.beforeEach 调 ensureElementPlus() 并等待，保证页面渲染前组件已注册；
 *   · AppLayout 改成异步组件，避免它（以及它 import 的 EP 模块）被打进首屏包；
 *   · 图标只注册白名单（plugins/icons.js），不再全量注册近千个。
 *
 * 仍然使用 EP 的整包 CSS：按组件引样式需要手动维护 13 个组件的依赖链，
 * 漏一个就是布局塌陷，收益（CSS 已经在 gzip 后约 40KB）不值这个风险。
 */

let hostApp = null
let installPromise = null

/** 由 main.js 在 createApp 之后调用 */
export function setElementHost(app) {
  hostApp = app
}

export function ensureElementPlus() {
  if (installPromise) return installPromise
  if (!hostApp) return Promise.reject(new Error('Element Plus 宿主未初始化'))

  installPromise = Promise.all([
    import('element-plus'),
    import('element-plus/es/locale/lang/zh-cn'),
    import('element-plus/dist/index.css'),
    import('./icons.js'),
  ])
    .then(([elementPlus, locale, , icons]) => {
      hostApp.use(elementPlus.default, { locale: locale.default })

      for (const [name, component] of Object.entries(icons)) {
        if (component) hostApp.component(name, component)
      }
    })
    .catch((error) => {
      // 失败后允许下次导航重试；否则一次网络抖动会让整个会话都用不了 EP
      installPromise = null
      console.error('[element] 按需加载失败', error)
      throw error
    })

  return installPromise
}
