import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import { useThemeStore } from './stores/theme'
import { useUserStore } from './stores/user'
import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 挂载前先把主题同步到 <html>，与 index.html 内联脚本保持一致（防止极端情况下类丢失）。
useThemeStore(pinia).sync()

// 建档 + 记录渠道来源。放在这里而不是各页面里，是为了保证「任何入口进来的第一次访问」
// 都能被归因 —— 落地页 / 是渠道参数最先到达的地方，漏掉它整套渠道统计就废了。
// 这个调用是刻意不 await 的：用户状态不该阻塞首屏渲染。
useUserStore(pinia).bootstrap()

app.mount('#app')
