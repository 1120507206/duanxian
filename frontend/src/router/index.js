import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
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
