<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { probeApi } from '@/api'

const targets = [
  { key: 'health', label: '后端健康检查', path: '/health', critical: true },
  { key: 'home', label: '首页行情聚合', path: '/home', critical: true },
  { key: 'ztlive', label: '涨停播报', path: '/ztlive', critical: true },
  { key: 'lianban', label: '连板排行', path: '/lianban', critical: true },
  { key: 'jingjia', label: '集合竞价', path: '/jingjia', critical: false },
  { key: 'zijin', label: '资金流向', path: '/zijin', critical: false },
  { key: 'fupan', label: '每日复盘', path: '/fupan', critical: false },
  { key: 'kline', label: 'K 线样本', path: '/kline/600519', critical: false },
]

const loading = ref(false)
const checks = ref([])
const health = ref(null)
const lastCheckedAt = ref('')

const okCount = computed(() => checks.value.filter((item) => item.status === 'ok').length)
const warnCount = computed(() => checks.value.filter((item) => item.status === 'warn').length)
const failCount = computed(() => checks.value.filter((item) => item.status === 'fail').length)
const pendingCount = computed(() => checks.value.filter((item) => item.status === 'checking').length)
const criticalFailCount = computed(() => checks.value.filter((item) => item.status === 'fail' && item.critical).length)

const overall = computed(() => {
  if (!checks.value.length || (loading.value && pendingCount.value > 0 && okCount.value + warnCount.value + failCount.value === 0)) {
    return {
      status: 'checking',
      text: '等待自检',
      desc: '点击刷新后会探测后端、数据库和核心行情接口。',
    }
  }

  if (pendingCount.value > 0) {
    return {
      status: 'checking',
      text: '检查中',
      desc: '正在逐项探测接口，较慢的数据源会继续等待。',
    }
  }

  if (criticalFailCount.value > 0) {
    return {
      status: 'fail',
      text: '核心异常',
      desc: '关键接口不可用，建议先检查 PM2、Nginx 反代和后端日志。',
    }
  }

  if (failCount.value > 0 || warnCount.value > 0) {
    return {
      status: 'warn',
      text: '需要观察',
      desc: '服务能打开，但部分接口为空或异常，可能是数据源波动或非交易时段。',
    }
  }

  return {
    status: 'ok',
    text: '可以使用',
    desc: '后端、数据库和核心接口均通过当前自检。',
  }
})

const statusClass = computed(() => `is-${overall.value.status}`)
const checkedText = computed(() => lastCheckedAt.value || '尚未检查')
const memoryText = computed(() => formatBytes(health.value?.memory?.rss))
const uptimeText = computed(() => formatUptime(health.value?.uptime))

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '-'
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatUptime(seconds) {
  if (!Number.isFinite(seconds)) return '-'
  const day = Math.floor(seconds / 86400)
  const hour = Math.floor((seconds % 86400) / 3600)
  const minute = Math.floor((seconds % 3600) / 60)

  if (day > 0) return `${day}天 ${hour}小时`
  if (hour > 0) return `${hour}小时 ${minute}分钟`
  return `${Math.max(minute, 1)}分钟`
}

function countList(data, key = 'list') {
  return Array.isArray(data?.[key]) ? data[key].length : 0
}

function evaluate(target, data) {
  if (target.key === 'health') {
    if (data?.status === 'ok' && data?.database?.ok) {
      return {
        status: 'ok',
        message: '运行正常',
        detail: `SQLite 正常，缓存键 ${data?.cache?.keys ?? 0} 个`,
      }
    }

    return {
      status: 'fail',
      message: '健康检查降级',
      detail: '数据库或后端状态异常，请查看后端日志。',
    }
  }

  if (target.key === 'home') {
    const indexCount = countList(data, 'indices')
    const sentimentReady = data?.sentiment && Object.keys(data.sentiment).length > 0

    if (indexCount > 0 && sentimentReady) {
      return {
        status: 'ok',
        message: '行情聚合正常',
        detail: `指数 ${indexCount} 条，市场情绪已返回`,
      }
    }

    return {
      status: 'warn',
      message: '首页数据为空',
      detail: '接口可达但数据不足，可能正在使用兜底数据。',
    }
  }

  if (target.key === 'ztlive') {
    const total = countList(data)
    const sealed = Number(data?.summary?.sealed || 0)

    if (total > 0 && sealed >= 0) {
      return {
        status: 'ok',
        message: '播报数据正常',
        detail: `交易日 ${data?.date || '-'}，涨停 ${sealed} 条，板块 ${data?.plates?.length || 0} 个`,
      }
    }

    return {
      status: 'warn',
      message: '播报暂无数据',
      detail: '非交易日或外部行情快照暂时没有返回记录。',
    }
  }

  if (target.key === 'fupan') {
    const hotCount = countList(data, 'hotPlates')
    const topCount = countList(data, 'topZt') + countList(data, 'topAmount')
    const total = Number(data?.ztCount || 0) + Number(data?.dtCount || 0) + hotCount + topCount

    if (total > 0) {
      return {
        status: 'ok',
        message: '复盘数据正常',
        detail: `日期 ${data?.date || '-'}，热点 ${hotCount} 个`,
      }
    }

    return {
      status: 'warn',
      message: '复盘暂无数据',
      detail: '非交易日或第三方接口波动时可能为空。',
    }
  }

  if (target.key === 'kline') {
    const total = countList(data, 'data')

    if (total > 0) {
      return {
        status: 'ok',
        message: 'K 线样本正常',
        detail: `样本返回 ${total} 条`,
      }
    }

    return {
      status: 'warn',
      message: 'K 线样本为空',
      detail: '请确认服务器能访问行情源，或稍后重试。',
    }
  }

  const total = countList(data)
  if (total > 0) {
    return {
      status: 'ok',
      message: '数据正常',
      detail: `返回 ${total} 条记录`,
    }
  }

  return {
    status: 'warn',
    message: '数据为空',
    detail: '接口可达，但当前没有有效记录。',
  }
}

function getBadgeText(status) {
  return {
    ok: '正常',
    warn: '观察',
    fail: '异常',
    checking: '检查中',
  }[status] || '待检'
}

function formatLatency(item) {
  return item.checked ? `${item.latency} ms` : '等待中'
}

async function runCheck(target) {
  const startedAt = performance.now()

  try {
    const data = await probeApi(target.path)
    const latency = Math.round(performance.now() - startedAt)
    const result = evaluate(target, data)

    return {
      ...target,
      ...result,
      latency,
      checked: true,
      payload: target.key === 'health' ? data : null,
    }
  } catch (err) {
    const latency = Math.round(performance.now() - startedAt)
    const status = err.response?.status ? `HTTP ${err.response.status}` : '网络错误'

    return {
      ...target,
      status: 'fail',
      message: '接口不可用',
      detail: `${status}，${err.message || '请求失败'}`,
      latency,
      checked: true,
      payload: null,
    }
  }
}

async function refreshStatus(showMessage = false) {
  loading.value = true
  health.value = null
  checks.value = targets.map((target) => ({
    ...target,
    status: 'checking',
    message: '正在检查',
    detail: '等待接口响应...',
    latency: '-',
    checked: false,
    payload: null,
  }))

  try {
    const results = await Promise.all(targets.map(async (target, index) => {
      const result = await runCheck(target)
      checks.value.splice(index, 1, result)
      if (target.key === 'health') health.value = result.payload
      return result
    }))

    checks.value = results
    health.value = results.find((item) => item.key === 'health')?.payload || null
    lastCheckedAt.value = new Date().toLocaleString('zh-CN', { hour12: false })

    if (showMessage) {
      ElMessage({
        type: failCount.value > 0 ? 'warning' : 'success',
        message: failCount.value > 0 ? '自检完成，有项目需要查看' : '自检通过',
      })
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refreshStatus()
})
</script>

<template>
  <div class="page status-page">
    <div class="page-header status-page-header">
      <div>
        <div class="status-kicker">OPS CENTER</div>
        <h2 class="page-title">上线状态中心</h2>
        <p class="status-lead">
          面向单机上线版的快速巡检：后端、SQLite、缓存和核心行情接口一屏看清。
        </p>
      </div>
      <el-button type="primary" :loading="loading" @click="refreshStatus(true)">
        <el-icon><Refresh /></el-icon>
        重新自检
      </el-button>
    </div>

    <section class="status-hero" :class="statusClass">
      <div class="status-hero-main">
        <span class="status-pill">{{ overall.text }}</span>
        <h3>{{ overall.desc }}</h3>
        <p>最后检查：{{ checkedText }}</p>
      </div>

      <div class="status-score">
        <span>{{ okCount }}</span>
        <small>/ {{ checks.length || targets.length }} 通过</small>
      </div>
    </section>

    <section class="metric-strip">
      <div class="metric-card">
        <span class="metric-label">数据库</span>
        <strong :class="health?.database?.ok ? 'text-rise' : 'text-fall'">
          {{ health?.database?.ok ? 'SQLite 正常' : '待检查' }}
        </strong>
      </div>
      <div class="metric-card">
        <span class="metric-label">运行时长</span>
        <strong>{{ uptimeText }}</strong>
      </div>
      <div class="metric-card">
        <span class="metric-label">内存 RSS</span>
        <strong>{{ memoryText }}</strong>
      </div>
      <div class="metric-card">
        <span class="metric-label">缓存键数</span>
        <strong>{{ health?.cache?.keys ?? '-' }}</strong>
      </div>
    </section>

    <section class="status-section">
      <div class="section-title">
        <span>接口自检</span>
        <em>HTTP 可达不等于数据有效，空列表会标为“观察”。</em>
      </div>

      <div class="check-list">
        <article
          v-for="item in checks"
          :key="item.key"
          class="check-card"
          :class="`is-${item.status}`"
        >
          <div class="check-topline">
            <div>
              <h3>{{ item.label }}</h3>
              <code>{{ item.path }}</code>
            </div>
            <span class="check-badge">{{ getBadgeText(item.status) }}</span>
          </div>
          <p class="check-message">{{ item.message }}</p>
          <p class="check-detail">{{ item.detail }}</p>
          <div class="check-meta">
            <span>{{ item.critical ? '核心接口' : '辅助接口' }}</span>
            <span>{{ formatLatency(item) }}</span>
          </div>
        </article>
      </div>
    </section>

    <section class="readiness-panel">
      <div>
        <h3>上线后每日建议</h3>
        <p>
          开盘前打开本页刷新一次；如果核心接口异常，优先看 PM2 日志、Nginx 反代和服务器到行情源的网络。
        </p>
      </div>
      <router-link to="/about" class="readiness-link">查看数据与风险说明 →</router-link>
    </section>
  </div>
</template>

<style scoped>
.status-page {
  max-width: 1180px;
}

.status-page-header {
  align-items: flex-start;
}

.status-kicker {
  margin-bottom: 6px;
  color: #f97316;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
}

.status-lead {
  margin: 8px 0 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.status-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 18px;
  padding: 22px;
  margin-bottom: 14px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background:
    radial-gradient(circle at 12% 10%, rgba(249, 115, 22, 0.18), transparent 28%),
    linear-gradient(135deg, rgba(20, 30, 48, 0.96), rgba(10, 14, 23, 0.94));
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.26);
}

.status-hero.is-ok {
  border-color: rgba(34, 197, 94, 0.42);
}

.status-hero.is-warn,
.status-hero.is-checking {
  border-color: rgba(249, 115, 22, 0.45);
}

.status-hero.is-fail {
  border-color: rgba(239, 68, 68, 0.52);
}

.status-hero-main {
  flex: 1;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(249, 115, 22, 0.16);
  color: #fed7aa;
  font-size: 12px;
  font-weight: 800;
}

.status-hero h3 {
  margin: 14px 0 8px;
  color: var(--color-text-primary);
  font-size: 22px;
  line-height: 1.4;
}

.status-hero p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.status-score {
  min-width: 150px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  color: var(--color-text-primary);
}

.status-score span {
  font-size: 54px;
  font-weight: 900;
  line-height: 1;
  color: #f97316;
  font-variant-numeric: tabular-nums;
}

.status-score small {
  margin-top: 6px;
  color: var(--color-text-secondary);
}

.metric-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.metric-card {
  flex: 1 1 190px;
  min-width: 160px;
  padding: 15px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: rgba(20, 30, 48, 0.82);
}

.metric-label {
  display: block;
  margin-bottom: 8px;
  color: var(--color-text-muted);
  font-size: 12px;
}

.metric-card strong {
  color: var(--color-text-primary);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}

.status-section {
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-bg-card);
}

.section-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.section-title span {
  color: var(--color-text-primary);
  font-size: 16px;
  font-weight: 800;
}

.section-title em {
  color: var(--color-text-muted);
  font-size: 12px;
  font-style: normal;
}

.check-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.check-card {
  flex: 1 1 270px;
  min-width: 240px;
  padding: 15px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-card);
}

.check-card.is-ok {
  border-color: rgba(34, 197, 94, 0.28);
}

.check-card.is-warn {
  border-color: rgba(249, 115, 22, 0.36);
}

.check-card.is-fail {
  border-color: rgba(239, 68, 68, 0.44);
}

.check-topline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.check-topline h3 {
  margin: 0 0 6px;
  color: var(--color-text-primary);
  font-size: 15px;
}

.check-topline code {
  color: var(--color-text-muted);
  font-size: 12px;
}

.check-badge {
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(90, 110, 136, 0.18);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.check-card.is-ok .check-badge {
  background: rgba(34, 197, 94, 0.14);
  color: #86efac;
}

.check-card.is-warn .check-badge {
  background: rgba(249, 115, 22, 0.14);
  color: #fdba74;
}

.check-card.is-fail .check-badge {
  background: rgba(239, 68, 68, 0.14);
  color: #fca5a5;
}

.check-message {
  margin: 14px 0 5px;
  color: var(--color-text-primary);
  font-weight: 700;
}

.check-detail {
  min-height: 38px;
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.check-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 12px;
}

.readiness-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-top: 16px;
  padding: 18px;
  border: 1px solid rgba(249, 115, 22, 0.28);
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.09), rgba(20, 30, 48, 0.7));
}

.readiness-panel h3 {
  margin: 0 0 8px;
  color: var(--color-text-primary);
  font-size: 16px;
}

.readiness-panel p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.readiness-link {
  flex-shrink: 0;
  color: #f97316;
  font-weight: 700;
  text-decoration: none;
}

.readiness-link:hover {
  color: #fb923c;
}

@media (max-width: 768px) {
  .status-page-header,
  .status-hero,
  .section-title,
  .readiness-panel {
    flex-direction: column;
  }

  .status-hero {
    padding: 18px;
  }

  .status-score {
    align-items: flex-start;
  }

  .check-card {
    min-width: 100%;
  }

  .readiness-link {
    width: 100%;
  }
}
</style>
