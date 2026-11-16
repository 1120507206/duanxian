import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setElementHost } from './plugins/element'
import { useThemeStore } from './stores/theme'
import { useUserStore } from './stores/user'
import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Element Plus 不再在这里全局安装：落地页不需要它，装了就会把 1.1MB JS +
// 348KB CSS 塞进首屏。改为进入非落地页时由路由守卫按需装载（见 plugins/element.js）。
setElementHost(app)

// 挂载前先把主题同步到 <html>，与 index.html 内联脚本保持一致（防止极端情况下类丢失）。
useThemeStore(pinia).sync()

// 建档 + 记录渠道来源。放在这里而不是各页面里，是为了保证「任何入口进来的第一次访问」
// 都能被归因 —— 落地页 / 是渠道参数最先到达的地方，漏掉它整套渠道统计就废了。
// 这个调用是刻意不 await 的：用户状态不该阻塞首屏渲染。
useUserStore(pinia).bootstrap()

app.mount('#app')
