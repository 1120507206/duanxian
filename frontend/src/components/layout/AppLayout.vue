<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { getMarketStatusText, isTradingTime } from '@/utils/tradingCalendar'
import { onNotify } from '@/utils/notify'

const route = useRoute()
const router = useRouter()
const now = ref(new Date())
const disclaimerVisible = ref(localStorage.getItem('duanxian:riskAccepted') !== '1')
let timerId = null
let stopNotify = null

const menuItems = [
  { path: '/', label: '首页', icon: 'HomeFilled' },
  { path: '/ztlive', label: '涨停播报', icon: 'Notification' },
  { path: '/lianban', label: '连板排行', icon: 'TrendCharts' },
  { path: '/longhu', label: '龙虎榜', icon: 'Trophy' },
  { path: '/jingjia', label: '集合竞价', icon: 'Timer' },
  { path: '/zijin', label: '资金流向', icon: 'Money' },
  { path: '/zixuan', label: '自选股', icon: 'Star' },
  { path: '/fupan', label: '每日复盘', icon: 'DataAnalysis' },
  { path: '/status', label: '状态中心', icon: 'Monitor' },
  { path: '/about', label: '风险说明', icon: 'WarningFilled' },
]

const marketOpen = computed(() => isTradingTime(now.value))
const marketStatusText = computed(() => getMarketStatusText(now.value))

function isActive(path) {
  return route.path === path
}

function acceptDisclaimer() {
  localStorage.setItem('duanxian:riskAccepted', '1')
  disclaimerVisible.value = false
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
      <div class="sidebar-logo" @click="router.push('/')">
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
          v-for="item in menuItems"
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
        <div class="sidebar-version">v1.0.0</div>
      </div>
    </aside>

    <main class="main-content">
      <slot />
    </main>

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
  background: #0a0e17;
}

.sidebar {
  width: 180px;
  flex-shrink: 0;
  background: linear-gradient(180deg, #0c1222 0%, #0f172a 50%, #0c1222 100%);
  border-right: 1px solid #1e3a5f;
  display: flex;
  flex-direction: column;
  z-index: 20;
  box-shadow: 2px 0 20px rgba(0, 0, 0, 0.3);
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 14px;
  cursor: pointer;
  border-bottom: 1px solid rgba(30, 58, 95, 0.6);
  transition: all 0.2s;
}

.sidebar-logo:hover { background: rgba(255, 255, 255, 0.02); }

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
  color: #e8edf5;
  letter-spacing: 0.05em;
}

.logo-sub {
  font-size: 10px;
  color: #5a6e88;
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
  color: #8fa0b8;
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: #c8d6e5;
  transform: translateX(2px);
}

.nav-item.active {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(249, 115, 22, 0.08));
  color: #f87171;
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
  border-top: 1px solid rgba(30, 58, 95, 0.6);
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
  background: #64748b;
  box-shadow: none;
  animation: none;
}

@keyframes pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 6px rgba(34, 197, 94, 0.5); }
  50% { opacity: 0.5; box-shadow: 0 0 2px rgba(34, 197, 94, 0.2); }
}

.status-text {
  font-size: 11px;
  color: #8fa0b8;
  font-weight: 500;
}

.sidebar-version {
  font-size: 10px;
  color: #5a6e88;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;
  background:
    radial-gradient(ellipse at 20% 0%, rgba(239, 68, 68, 0.03) 0%, transparent 60%),
    radial-gradient(ellipse at 80% 100%, rgba(59, 130, 246, 0.02) 0%, transparent 60%),
    #0f172a;
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
}
</style>
