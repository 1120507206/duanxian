<script setup>
import { computed, onMounted, provide, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAdminStore } from '@/stores/admin'
import { useThemeStore } from '@/stores/theme'
import { fetchOrders } from '@/api/admin'

/**
 * 后台外壳：侧边导航 + 顶栏 + 内容区。
 *
 * 刻意不复用前台的 AppLayout：
 *   - 前台有首访风险提示弹窗、行情状态灯、账户胶囊，这些在后台全是噪音；
 *   - 后台要的是「一屏看到全部数据」，所以侧栏更窄、内容区更宽。
 */
const route = useRoute()
const router = useRouter()
const adminStore = useAdminStore()
const themeStore = useThemeStore()

/** 待核对订单数。挂在侧栏上，运营进任何一页都能看到还有几笔钱等着放行 */
const pendingCount = ref(0)

const menuItems = [
  { path: '/admin/overview', label: '运营概览', icon: 'DataAnalysis' },
  { path: '/admin/users', label: '用户管理', icon: 'User' },
  { path: '/admin/orders', label: '订单管理', icon: 'Wallet' },
  { path: '/admin/codes', label: '激活码', icon: 'Ticket' },
  { path: '/admin/logs', label: '操作日志', icon: 'Document' },
]

const currentTitle = computed(() => route.meta?.title?.replace(' - 短线侠后台', '') || '运营后台')

function isActive(path) {
  return route.path === path || route.path.startsWith(`${path}/`)
}

async function refreshPendingCount() {
  try {
    const data = await fetchOrders({ status: 'confirming', pageSize: 1 })
    pendingCount.value = Number(data?.counts?.confirming || 0)
  } catch (_) {
    // 拿不到就不显示角标，不影响主流程
  }
}

// 页面里处理完订单后可以调它刷新角标，不用各自发请求
provide('refreshPendingCount', refreshPendingCount)

async function handleLogout() {
  await adminStore.logout()
  ElMessage.success('已退出后台')
  router.replace({ name: 'admin-login' })
}

function toggleTheme() {
  themeStore.toggle()
}

onMounted(async () => {
  const ok = await adminStore.ensureSession()
  if (!ok) {
    ElMessage.warning('后台登录已失效，请重新登录')
    router.replace({ name: 'admin-login', query: { redirect: route.fullPath } })
    return
  }
  refreshPendingCount()
})
</script>

<template>
  <div class="admin-shell">
    <aside class="admin-side">
      <div class="side-brand">
        <div class="brand-mark">DX</div>
        <div class="brand-text">
          <span class="brand-title">短线侠</span>
          <span class="brand-sub">运营后台</span>
        </div>
      </div>

      <nav class="side-nav">
        <router-link
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          class="side-item"
          :class="{ active: isActive(item.path) }"
        >
          <el-icon :size="16"><component :is="item.icon" /></el-icon>
          <span class="side-label">{{ item.label }}</span>
          <span
            v-if="item.path === '/admin/orders' && pendingCount > 0"
            class="side-badge"
          >{{ pendingCount }}</span>
        </router-link>
      </nav>

      <div class="side-footer">
        <a href="/" class="side-link">← 返回站点</a>
      </div>
    </aside>

    <div class="admin-main">
      <header class="admin-topbar">
        <div class="topbar-left">
          <h2 class="page-title">{{ currentTitle }}</h2>
          <span class="env-hint">数据来自本机库，操作即时生效</span>
        </div>

        <div class="topbar-right">
          <button
            type="button"
            class="icon-btn"
            :title="themeStore.isDark ? '切换到浅色' : '切换到深色'"
            @click="toggleTheme"
          >
            <el-icon :size="15">
              <Sunny v-if="themeStore.isDark" />
              <Moon v-else />
            </el-icon>
          </button>

          <span class="admin-name">
            <el-icon :size="14"><UserFilled /></el-icon>
            {{ adminStore.adminName }}
          </span>

          <el-button size="small" @click="handleLogout">退出登录</el-button>
        </div>
      </header>

      <main class="admin-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--color-bg-deep);
}

.admin-side {
  width: 190px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-card);
  border-right: 1px solid var(--color-border);
}

.side-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 14px;
  border-bottom: 1px solid var(--color-border);
}

.brand-mark {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  color: #fff;
  font-weight: 900;
  font-size: 14px;
  letter-spacing: -0.5px;
  flex-shrink: 0;
}

.brand-text { display: flex; flex-direction: column; }

.brand-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text-primary);
  letter-spacing: 0.04em;
}

.brand-sub {
  font-size: 10px;
  color: var(--color-text-muted);
  letter-spacing: 0.06em;
}

.side-nav {
  flex: 1;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.side-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 12px;
  border-radius: 8px;
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  transition: all var(--transition-fast);
}

.side-item:hover {
  background: var(--color-bg-card-hover);
  color: var(--color-text-primary);
}

.side-item.active {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.14), rgba(249, 115, 22, 0.07));
  color: var(--color-rise);
}

.side-label { flex: 1; }

.side-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--color-rise);
  color: #fff;
  font-size: 10.5px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.side-footer {
  padding: 12px 14px;
  border-top: 1px solid var(--color-border);
}

.side-link {
  font-size: 11.5px;
  color: var(--color-text-muted);
  text-decoration: none;
  transition: color var(--transition-fast);
}

.side-link:hover { color: var(--color-rise); }

.admin-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.admin-topbar {
  height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border);
}

.topbar-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
}

.page-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  letter-spacing: 0.02em;
}

.env-hint {
  font-size: 11.5px;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-base);
  color: var(--color-text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.icon-btn:hover {
  color: var(--color-rise);
  border-color: var(--color-rise);
}

.admin-name {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.admin-content {
  flex: 1;
  overflow-y: auto;
  min-width: 0;
  padding: 20px;
  background: var(--color-bg-base);
}

@media (max-width: 900px) {
  .admin-side { width: 58px; }
  .brand-text, .side-label, .side-link { display: none; }
  .side-item { justify-content: center; padding: 11px; }
  .side-brand { justify-content: center; padding: 14px 8px; }
  .side-badge { position: absolute; margin: -18px 0 0 18px; }
  .admin-content { padding: 12px; }
  .env-hint { display: none; }
}
</style>
