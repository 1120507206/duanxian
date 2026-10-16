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
import { useEmbedThemeStore } from '@/stores/theme'
import { useUserStore } from '@/stores/user'
import '@/assets/main.css'

const app = createApp(ZtliveEmbed)
const pinia = createPinia()

app.use(pinia)
app.use(ElementPlus, { locale: zhCn })

// 与 ztlive.html 头部内联脚本保持一致：挂载前把 store 状态同步到 <html>。
// 独立页使用「独立存储键 + 默认深色」，与主站主题互不影响。
useEmbedThemeStore(pinia).sync()

// 独立页自带入口，不经过 main.js，所以这里也要建档 —— 否则面板里打开时
// 拿不到会员权益，付费用户会被当成免费用户，语音开不了。
useUserStore(pinia).bootstrap()

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.mount('#app')

