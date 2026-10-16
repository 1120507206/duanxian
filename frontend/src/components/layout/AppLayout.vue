<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { getMarketStatusText, isTradingTime } from '@/utils/tradingCalendar'
import { onNotify } from '@/utils/notify'
import { useThemeStore } from '@/stores/theme'
import AccountChip from '@/components/member/AccountChip.vue'

const route = useRoute()
const router = useRouter()
const themeStore = useThemeStore()
const now = ref(new Date())
const disclaimerVisible = ref(localStorage.getItem('duanxian:riskAccepted') !== '1')
let timerId = null
let stopNotify = null

// 当前路由对应的页面标题，用于顶栏展示。
const currentTitle = computed(() => route.meta?.title || '短线侠')

// 当前只推「涨停播报」一个功能：hidden 的入口保留在代码里（路由照旧可访问），
// 等其它功能上线时把 hidden 去掉即可，不用改模板。
const menuItems = [
  { path: '/ztlive', label: '涨停播报', icon: 'Notification' },
  { path: '/home', label: '首页', icon: 'HomeFilled', hidden: true },
  { path: '/lianban', label: '连板排行', icon: 'TrendCharts', hidden: true },
  { path: '/longhu', label: '龙虎榜', icon: 'Trophy', hidden: true },
  { path: '/jingjia', label: '集合竞价', icon: 'Timer', hidden: true },
  { path: '/zijin', label: '资金流向', icon: 'Money', hidden: true },
  { path: '/zixuan', label: '自选股', icon: 'Star', hidden: true },
  { path: '/fupan', label: '每日复盘', icon: 'DataAnalysis', hidden: true },
  { path: '/status', label: '状态中心', icon: 'Monitor', hidden: true },
  { path: '/about', label: '风险说明', icon: 'WarningFilled', hidden: true },
]

const visibleMenuItems = computed(() => menuItems.filter((item) => !item.hidden))

const marketOpen = computed(() => isTradingTime(now.value))
const marketStatusText = computed(() => getMarketStatusText(now.value))

function isActive(path) {
  return route.path === path
}

function acceptDisclaimer() {
  localStorage.setItem('duanxian:riskAccepted', '1')
  disclaimerVisible.value = false
}

function toggleTheme() {
  themeStore.toggle()
}

onMounted(() => {
  timerId = window.setInterval(() => {
    now.value = new Date()
  }, 30000)

  stopNotify = onNotify((payload) => {
    ElMessage({
      type: payload.type || 'warning',
      message: payload.message,
      duration: 2800,
      showClose: true,
    })
  })
})

onBeforeUnmount(() => {
  if (timerId) window.clearInterval(timerId)
  stopNotify?.()
})
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="sidebar-logo" @click="router.push('/home')">
        <div class="logo-icon">
          <span class="logo-letters">DX</span>
        </div>
        <div class="logo-text-group">
          <span class="logo-text">短线侠</span>
          <span class="logo-sub">DuanXianXia</span>
        </div>
      </div>

      <nav class="sidebar-nav">
        <router-link
          v-for="item in visibleMenuItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: isActive(item.path) }"
        >
          <el-icon :size="18"><component :is="item.icon" /></el-icon>
          <span class="nav-label">{{ item.label }}</span>
          <span v-if="isActive(item.path)" class="nav-indicator" />
        </router-link>
      </nav>

      <div class="sidebar-footer">
        <div class="market-status">
          <span class="status-dot" :class="{ closed: !marketOpen }" />
          <span class="status-text">{{ marketStatusText }}</span>
        </div>
        <a class="sidebar-version" href="/ztlive.html" target="_blank" rel="noopener">独立页</a>
      </div>
    </aside>

    <div class="main-column">
      <header class="topbar">
        <div class="topbar-title">{{ currentTitle }}</div>
        <div class="topbar-actions">
          <AccountChip />
          <button
            class="theme-toggle"
            type="button"
            :title="themeStore.isDark ? '切换到浅色' : '切换到深色'"
            :aria-label="themeStore.isDark ? '切换到浅色' : '切换到深色'"
            @click="toggleTheme"
          >
            <el-icon :size="16" class="theme-icon">
              <Sunny v-if="themeStore.isDark" />
              <Moon v-else />
            </el-icon>
            <span class="theme-label">{{ themeStore.isDark ? '浅色' : '深色' }}</span>
          </button>
        </div>
      </header>

      <main class="main-content">
        <slot />
      </main>
    </div>

    <el-dialog v-model="disclaimerVisible" title="风险提示" width="420px" :close-on-click-modal="false">
      <p class="risk-copy">
        本工具展示的行情、榜单和复盘数据仅供研究参考，不构成任何投资建议。市场有风险，投资需谨慎。
      </p>
      <p class="risk-sub">
        数据来源依赖第三方公开接口，可能存在延迟、缺失或接口波动，请以交易所及券商官方数据为准。
      </p>
      <template #footer>
        <el-button type="primary" @click="acceptDisclaimer">我已了解</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--color-bg-deep);
}

.sidebar {
  width: 180px;
  flex-shrink: 0;
  background: var(--color-bg-card);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  z-index: 20;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--color-border);
  transition: background var(--transition-fast);
}

.sidebar-logo:hover { background: var(--color-bg-card-hover); }

.logo-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
  flex-shrink: 0;
}

.logo-letters {
  color: #fff;
  font-weight: 900;
  font-size: 15px;
  letter-spacing: -0.5px;
}

.logo-text-group { display: flex; flex-direction: column; gap: 1px; }

.logo-text {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
  letter-spacing: 0.05em;
}

.logo-sub {
  font-size: 10px;
  color: var(--color-text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.sidebar-nav {
  flex: 1;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  transition: all var(--transition-fast);
  position: relative;
  overflow: hidden;
}

.nav-item:hover {
  background: var(--color-bg-card-hover);
  color: var(--color-text-primary);
  transform: translateX(2px);
}

.nav-item.active {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(249, 115, 22, 0.08));
  color: var(--color-rise);
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.08);
}

.nav-indicator {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  background: linear-gradient(180deg, #ef4444, #f97316);
  border-radius: 0 2px 2px 0;
}

.nav-label { font-weight: 500; }

.sidebar-footer {
  padding: 14px 16px;
  border-top: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.market-status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
  animation: pulse 2.5s infinite;
}

.status-dot.closed {
  background: var(--color-text-muted);
  box-shadow: none;
  animation: none;
}

@keyframes pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 6px rgba(34, 197, 94, 0.5); }
  50% { opacity: 0.5; box-shadow: 0 0 2px rgba(34, 197, 94, 0.2); }
}

.status-text {
  font-size: 11px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.sidebar-version {
  font-size: 10px;
  color: var(--color-text-muted);
  text-decoration: none;
  transition: color var(--transition-fast);
}

.sidebar-version:hover { color: var(--color-rise); }

/* ---------- 主列：顶栏 + 内容 ---------- */
.main-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.topbar {
  height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border);
  transition: background-color var(--transition-smooth), border-color var(--transition-smooth);
}

.topbar-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  letter-spacing: 0.02em;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-base);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.theme-toggle:hover {
  color: var(--color-rise);
  border-color: var(--color-rise);
  background: var(--color-rise-soft);
}

.theme-icon { transition: transform var(--transition-smooth); }
.theme-toggle:hover .theme-icon { transform: rotate(20deg); }
.theme-label { line-height: 1; }

.main-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;
  background: var(--color-bg-base);
  transition: background-color var(--transition-smooth);
}

.risk-copy,
.risk-sub {
  margin: 0;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.risk-sub {
  margin-top: 10px;
  color: var(--color-text-muted);
  font-size: 13px;
}

@media (max-width: 768px) {
  .sidebar { width: 56px; }
  .logo-text-group, .nav-label, .status-text, .sidebar-version { display: none; }
  .nav-item { justify-content: center; padding: 12px; }
  .sidebar-logo { justify-content: center; padding: 14px; }
  .nav-indicator { left: auto; right: 0; }
  .topbar { padding: 0 12px; }
  .topbar-title { font-size: 13px; }
  .theme-label { display: none; }
}
</style>
