import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    // 站点根路径导向营销落地页（Landing）。营销页自带深色视觉、无侧边栏，
    // 首屏不挂 AppLayout，因此不会出现「先闪侧边栏再跳走」的问题。
    path: '/',
    name: 'landing',
    component: () => import('@/views/Landing.vue'),
    meta: { title: '短线侠 - A股短线交易工具' },
  },
  {
    path: '/app',
    // 原首页重定向到 /app，现在首页语义指向 /home
    redirect: '/home',
  },
  {
    path: '/home',
    name: 'home',
    component: () => import('@/views/Home.vue'),
    meta: { title: '首页 - 短线侠' },
  },
  {
    path: '/lianban',
    name: 'lianban',
    component: () => import('@/views/Lianban.vue'),
    meta: { title: '连板排行 - 短线侠' },
  },
  {
    path: '/ztlive',
    name: 'ztlive',
    component: () => import('@/views/Ztlive.vue'),
    meta: { title: '涨停播报 - 短线侠' },
  },
  {
    path: '/longhu',
    name: 'longhu',
    component: () => import('@/views/Longhu.vue'),
    meta: { title: '龙虎榜 - 短线侠' },
  },
  {
    path: '/jingjia',
    name: 'jingjia',
    component: () => import('@/views/Jingjia.vue'),
    meta: { title: '集合竞价 - 短线侠' },
  },
  {
    path: '/zijin',
    name: 'zijin',
    component: () => import('@/views/Zijin.vue'),
    meta: { title: '资金流向 - 短线侠' },
  },
  {
    path: '/zixuan',
    name: 'zixuan',
    component: () => import('@/views/Zixuan.vue'),
    meta: { title: '自选股 - 短线侠' },
  },
  {
    path: '/fupan',
    name: 'fupan',
    component: () => import('@/views/Fupan.vue'),
    meta: { title: '每日复盘 - 短线侠' },
  },
  {
    path: '/status',
    name: 'status',
    component: () => import('@/views/Status.vue'),
    meta: { title: '上线状态中心 - 短线侠' },
  },
  {
    path: '/about',
    name: 'about',
    component: () => import('@/views/About.vue'),
    meta: { title: '数据与风险说明 - 短线侠' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.afterEach((to) => {
  document.title = to.meta?.title || '短线侠 - A股短线交易工具'
})

export default router
