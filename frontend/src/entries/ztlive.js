// 涨停播报独立页入口（通达信面板专用）。
// 与全量 SPA 的 main.js 区别：不挂路由、不挂 AppLayout，只渲染涨停播报一个页面，
// 面板里打开更快，也不会出现侧边栏和其它功能入口。
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
// 独立页只用到搜索一个图标，不能像以前那样 import * 全量注册：
// 通达信内置浏览器对首包很敏感，近千个图标是纯负担。
//
// 注：试过按需注册 13 个组件，EP 的 barrel 仍会把整库打进 chunk（863KB 没变），
// 所以这里保留全量安装 —— 少注册几十个组件换不来体积收益，却增加漏注册风险。
import { Search as SearchIcon } from '@element-plus/icons-vue'
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

app.component('SearchIcon', SearchIcon)

app.mount('#app')
