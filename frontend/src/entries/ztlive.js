// 涨停播报独立页入口（通达信面板专用）。
// 与全量 SPA 的 main.js 区别：不挂路由、不挂 AppLayout，只渲染涨停播报一个页面，
// 面板里打开更快，也不会出现侧边栏和其它功能入口。
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import ZtliveEmbed from '@/views/ZtliveEmbed.vue'
import '@/assets/main.css'

const app = createApp(ZtliveEmbed)

app.use(createPinia())
app.use(ElementPlus, { locale: zhCn })

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.mount('#app')

