import { createRouter, createWebHistory } from 'vue-router'
import { getAdminToken } from '@/utils/adminToken'

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
    path: '/login',
    name: 'login',
    component: () => import('@/views/Login.vue'),
    meta: { title: '登录 / 注册 - 短线侠', public: true },
  },
  {
    path: '/activate',
    name: 'activate',
    component: () => import('@/views/Activate.vue'),
    meta: { title: '开通会员 - 短线侠' },
  },
  {
    path: '/about',
    name: 'about',
    component: () => import('@/views/About.vue'),
    meta: { title: '数据与风险说明 - 短线侠' },
  },
  // ========== 运营后台 ==========
  // 后台与前台共用同一个 SPA 构建产物：部署时 Nginx 的 try_files 已经把
  // /admin/* 兜到 index.html，不需要额外配置。所有后台页面都是懒加载，
  // 普通用户访问站点不会下载到后台的代码。
  {
    path: '/admin/login',
    name: 'admin-login',
    component: () => import('@/views/admin/AdminLogin.vue'),
    meta: { title: '后台登录 - 短线侠运营后台', public: true },
  },
  {
    path: '/admin',
    component: () => import('@/views/admin/AdminLayout.vue'),
    redirect: '/admin/overview',
    children: [
      {
        path: 'overview',
        name: 'admin-overview',
        component: () => import('@/views/admin/AdminOverview.vue'),
        meta: { title: '运营概览 - 短线侠后台' },
      },
      {
        path: 'users',
        name: 'admin-users',
        component: () => import('@/views/admin/AdminUsers.vue'),
        meta: { title: '用户管理 - 短线侠后台' },
      },
      {
        path: 'orders',
        name: 'admin-orders',
        component: () => import('@/views/admin/AdminOrders.vue'),
        meta: { title: '订单管理 - 短线侠后台' },
      },
      {
        path: 'codes',
        name: 'admin-codes',
        component: () => import('@/views/admin/AdminCodes.vue'),
        meta: { title: '激活码管理 - 短线侠后台' },
      },
      {
        path: 'logs',
        name: 'admin-logs',
        component: () => import('@/views/admin/AdminLogs.vue'),
        meta: { title: '操作日志 - 短线侠后台' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

/**
 * 后台路由守卫。
 *
 * 这里只做「本地有没有 token」这一层检查 —— 它快，且能在没有网络时立刻跳转。
 * token 到底还有没有效，由 AdminLayout 进页面后调 /api/admin/me 复核，
 * 那一步拿到 401 才会清 token 并踢回登录页。
 *
 * 这样分工的原因：如果守卫里发起网络请求，每次后台内跳转都要等一次往返，
 * 断网时甚至会卡在登录页出不去。
 */
router.beforeEach((to) => {
  if (!String(to.path).startsWith('/admin')) return true
  if (to.name === 'admin-login') return true
  if (!getAdminToken()) {
    return { name: 'admin-login', query: { redirect: to.fullPath } }
  }
  return true
})

router.afterEach((to) => {
  document.title = to.meta?.title || '短线侠 - A股短线交易工具'
})

export default router
