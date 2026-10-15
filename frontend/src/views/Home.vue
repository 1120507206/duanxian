<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { useMarketStore } from '@/stores/market'
import { useThemeStore } from '@/stores/theme'

const store = useMarketStore()
const themeStore = useThemeStore()
const sentimentChartRef = ref(null)
const flowChartRef = ref(null)
let sentimentChart = null
let flowChart = null

const riseCount = computed(() => store.sentiment.upCount)
const fallCount = computed(() => store.sentiment.downCount)

// 数据更新时间（首次进入 / 刷新时更新），用于标题区副标题展示。
const updatedAt = ref('')
function markUpdated() {
  updatedAt.value = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// 图表主题：深色用 ECharts 内置 'dark'，浅色用默认主题 + 自定义刻度色。
function chartTheme() {
  return themeStore.isDark ? 'dark' : undefined
}
// 图表辅助文字色，跟随主题令牌（浅色用次要文字灰、深色用浅灰）。
function axisTextColor() {
  return themeStore.isDark ? '#8fa0b8' : '#5b6b82'
}
function splitLineColor() {
  return themeStore.isDark ? 'rgba(30,58,95,0.6)' : 'rgba(226,232,240,0.9)'
}

function initSentimentChart() {
  if (!sentimentChartRef.value) return

  sentimentChart?.dispose()
  sentimentChart = echarts.init(sentimentChartRef.value, chartTheme())
  sentimentChart.setOption({
    grid: { top: 14, right: 12, bottom: 8, left: 12, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      textStyle: { fontSize: 12 },
    },
    xAxis: {
      type: 'category',
      data: ['封板率', '连板高度', '上涨家数', '下跌家数'],
      axisLabel: { fontSize: 10, color: axisTextColor() },
      axisLine: { lineStyle: { color: splitLineColor() } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLabel: { show: false },
      splitLine: { show: false },
      axisLine: { show: false },
    },
    series: [{
      type: 'bar',
      barWidth: 18,
      itemStyle: { borderRadius: [6, 6, 0, 0] },
      data: [
        {
          value: store.sentiment.ztRatio,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#ef4444' },
              { offset: 1, color: '#dc2626' },
            ]),
            borderRadius: [6, 6, 0, 0],
          },
        },
        {
          value: store.sentiment.lianbanHeight * 10,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#f97316' },
              { offset: 1, color: '#ea580c' },
            ]),
            borderRadius: [6, 6, 0, 0],
          },
        },
        {
          value: store.sentiment.upCount / 100,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#ef4444' },
              { offset: 1, color: '#dc2626' },
            ]),
            borderRadius: [6, 6, 0, 0],
          },
        },
        {
          value: store.sentiment.downCount / 100,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#22c55e' },
              { offset: 1, color: '#16a34a' },
            ]),
            borderRadius: [6, 6, 0, 0],
          },
        },
      ],
    }],
  })
}

function initFlowChart() {
  if (!flowChartRef.value) return

  flowChart?.dispose()
  flowChart = echarts.init(flowChartRef.value, chartTheme())
  flowChart.setOption({
    grid: { top: 16, right: 12, bottom: 8, left: 12, containLabel: true },
    tooltip: {
      trigger: 'axis',
      textStyle: { fontSize: 12 },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: ['09:30', '10:00', '10:30', '11:00', '11:30', '13:30', '14:00', '14:30', '15:00'],
      axisLabel: { fontSize: 10, color: axisTextColor() },
      axisLine: { lineStyle: { color: splitLineColor() } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLabel: { show: false },
      splitLine: { show: false },
      axisLine: { show: false },
    },
    series: [{
      type: 'line',
      data: [120, 200, 180, 250, 300, 280, 350, 400, 380],
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      showSymbol: false,
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(239,68,68,0.25)' },
          { offset: 1, color: 'rgba(239,68,68,0)' },
        ]),
      },
      lineStyle: { color: '#ef4444', width: 2.5 },
      itemStyle: { color: '#ef4444' },
    }],
  })
}

function renderCharts() {
  initSentimentChart()
  initFlowChart()
}

async function loadHomeView() {
  await Promise.all([
    store.loadHome(),
    store.loadLianban(),
    store.loadLonghu(),
    store.loadJingjia(),
  ])
  renderCharts()
  markUpdated()
}

async function refreshHomeSummary() {
  await store.refreshHome()
  initSentimentChart()
  markUpdated()
}

// 主题切换时重建图表（ECharts 主题需在 init 时指定，dispose 后重建最稳）。
watch(
  () => themeStore.isDark,
  () => {
    renderCharts()
  },
)

function handleResize() {
  sentimentChart?.resize()
  flowChart?.resize()
}

onMounted(async () => {
  window.addEventListener('resize', handleResize)
  await loadHomeView()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  sentimentChart?.dispose()
  flowChart?.dispose()
})
</script>

<template>
  <div class="home-page">
    <div class="page-header home-header">
      <div>
        <h1 class="page-title">市场总览</h1>
        <p class="home-subtitle">
          实时情绪 · 资金 · 梯队一屏总览
          <span v-if="updatedAt" class="home-updated">更新于 {{ updatedAt }}</span>
        </p>
      </div>
    </div>

    <div class="index-strip">
      <div v-for="item in store.indices" :key="item.code" class="index-item">
        <span class="idx-name">{{ item.name }}</span>
        <span class="idx-value tnum">{{ Number(item.value).toFixed(2) }}</span>
        <span :class="['idx-change', 'tnum', Number(item.pct) >= 0 ? 'idx-up' : 'idx-down']">
          <span class="idx-arrow">{{ Number(item.pct) >= 0 ? '▲' : '▼' }}</span>
          {{ Number(item.pct) >= 0 ? '+' : '' }}{{ Number(item.pct).toFixed(2) }}%
        </span>
      </div>
      <div class="index-time">
        <span class="live-dot" />
        {{ new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}
      </div>
    </div>

    <div class="home-grid">
      <div class="card sentiment-card glow-border">
        <div class="card-header">
          <span class="card-title">市场情绪</span>
          <el-button size="small" text @click="refreshHomeSummary">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </div>
        <div class="sentiment-grid">
          <div class="sent-item stat-animate sent-rise">
            <span class="sent-label">涨停家数</span>
            <span class="sent-value text-rise tnum">{{ store.sentiment.ztCount }}</span>
          </div>
          <div class="sent-item stat-animate sent-fall">
            <span class="sent-label">跌停家数</span>
            <span class="sent-value text-fall tnum">{{ store.sentiment.dtCount }}</span>
          </div>
          <div class="sent-item stat-animate sent-rise">
            <span class="sent-label">封板率</span>
            <span class="sent-value text-rise tnum">{{ store.sentiment.ztRatio }}%</span>
          </div>
          <div class="sent-item stat-animate sent-accent">
            <span class="sent-label">连板高度</span>
            <span class="sent-value sent-accent-value tnum">{{ store.sentiment.lianbanHeight }}板</span>
          </div>
          <div class="sent-item stat-animate sent-rise">
            <span class="sent-label">上涨家数</span>
            <span class="sent-value text-rise tnum">{{ riseCount }}</span>
          </div>
          <div class="sent-item stat-animate sent-fall">
            <span class="sent-label">下跌家数</span>
            <span class="sent-value text-fall tnum">{{ fallCount }}</span>
          </div>
        </div>
        <div ref="sentimentChartRef" class="mini-chart" />
      </div>

      <div class="card glow-border">
        <div class="card-header">
          <span class="card-title">主力资金流向</span>
        </div>
        <div class="flow-big-number">
          <span class="flow-amount tnum" :class="store.sentiment.mainFlow >= 0 ? 'text-rise' : 'text-fall'">
            {{ store.sentiment.mainFlow >= 0 ? '+' : '' }}{{ Number(store.sentiment.mainFlow).toFixed(1) }}<span class="flow-unit">亿</span>
          </span>
          <div class="flow-meta">
            <span>成交额 {{ store.sentiment.turnover }} 亿</span>
            <span class="flow-label" :class="store.sentiment.kuiqian >= 0 ? 'text-rise' : 'text-fall'">
              亏钱效应 {{ store.sentiment.kuiqian }}
            </span>
          </div>
        </div>
        <div ref="flowChartRef" class="mini-chart" />
      </div>

      <div class="card lb-card glow-border">
        <div class="card-header">
          <span class="card-title">连板梯队</span>
          <router-link to="/lianban" class="more-link">更多 →</router-link>
        </div>
        <div v-for="(stocks, board) in store.lianbanGroups" :key="board" class="lb-row">
          <span class="lb-board">{{ board }}</span>
          <span class="lb-names">{{ stocks.map((s) => s.name).join('、') }}</span>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">龙虎榜</span>
          <router-link to="/longhu" class="more-link">更多 →</router-link>
        </div>
        <el-table :data="store.longhuList.slice(0, 5)" size="small" stripe>
          <el-table-column prop="name" label="股票" width="85" />
          <el-table-column prop="pct" label="涨幅" width="75">
            <template #default="{ row }">
              <span class="font-medium text-rise tnum">+{{ row.pct }}%</span>
            </template>
          </el-table-column>
          <el-table-column prop="buyTotal" label="买入(万)" width="90">
            <template #default="{ row }">
              <span class="font-medium text-rise tnum">{{ row.buyTotal }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="sellTotal" label="卖出(万)" width="90">
            <template #default="{ row }">
              <span class="text-fall tnum">{{ row.sellTotal }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="netFlow" label="净买(万)">
            <template #default="{ row }">
              <span :class="Number(row.netFlow) >= 0 ? 'text-rise font-medium tnum' : 'text-fall tnum'">{{ row.netFlow }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">竞价异动</span>
          <router-link to="/jingjia" class="more-link">更多 →</router-link>
        </div>
        <div class="jj-mini-list">
          <div v-for="item in store.jingjiaList.slice(0, 8)" :key="item.code" class="jj-mini-item">
            <span class="jj-name">{{ item.name }}</span>
            <span :class="['jj-pct', 'tnum', Number(item.jjPct) >= 0 ? 'text-rise' : 'text-fall']">
              {{ Number(item.jjPct) >= 0 ? '+' : '' }}{{ item.jjPct }}%
            </span>
            <span class="jj-amt tnum">{{ item.jjAmount }}亿</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  padding: 20px;
  max-width: 1440px;
  margin: 0 auto;
}

.home-header { margin-bottom: 16px; }

.home-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.home-updated {
  font-size: 12px;
  color: var(--color-text-muted);
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-card);
}

/* ---------- 指数条 ---------- */
.index-strip {
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 14px 20px;
  margin-bottom: 16px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow-x: auto;
  box-shadow: var(--shadow-card);
  transition: background-color var(--transition-smooth), border-color var(--transition-smooth);
}

.index-item {
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
  padding-right: 22px;
  border-right: 1px solid var(--color-border);
}

.index-item:last-of-type { border-right: none; }

.idx-name { font-size: 12px; color: var(--color-text-secondary); font-weight: 500; min-width: 52px; }
.idx-value { font-size: 15px; font-weight: 700; color: var(--color-text-primary); font-variant-numeric: tabular-nums; }
.idx-change { font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 999px; }
.idx-up { color: var(--color-rise); background: var(--color-rise-soft); }
.idx-down { color: var(--color-fall); background: var(--color-fall-soft); }
.idx-arrow { font-size: 9px; margin-right: 1px; }

.index-time {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding-left: 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22c55e;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 6px rgba(34, 197, 94, 0.6); }
  50% { opacity: 0.4; box-shadow: 0 0 2px rgba(34, 197, 94, 0.2); }
}

/* ---------- 网格 ---------- */
.home-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.sentiment-card { grid-row: span 2; }

.sentiment-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 14px;
}

/* 统计小色块：顶部色条 + 层级背景 */
.sent-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background: var(--color-bg-card-hover);
  border: 1px solid var(--color-border);
  border-top-width: 3px;
  border-radius: 8px;
  transition: background-color var(--transition-fast), border-color var(--transition-fast);
}
.sent-item:hover { background: var(--color-bg-elevated); }
.sent-rise { border-top-color: var(--color-rise); }
.sent-fall { border-top-color: var(--color-fall); }
.sent-accent { border-top-color: var(--color-accent); }

.sent-label { font-size: 11px; color: var(--color-text-secondary); font-weight: 500; }
.sent-value { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
.sent-accent-value { color: var(--color-accent); }

/* ---------- 资金大数字 ---------- */
.flow-big-number {
  text-align: center;
  padding: 16px 0 8px;
}

.flow-amount { font-size: 34px; font-weight: 900; letter-spacing: -0.5px; }
.flow-unit { font-size: 16px; font-weight: 600; }

.flow-meta {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.flow-label { font-weight: 600; }
.mini-chart { height: 150px; }

/* ---------- 连板梯队 ---------- */
.lb-card { grid-row: span 1; }

.lb-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  font-size: 13px;
  border-radius: 6px;
  transition: background-color var(--transition-fast);
}

.lb-row:hover { background: var(--color-bg-card-hover); }

.lb-board {
  background: linear-gradient(135deg, #ef4444, #f97316);
  color: #fff;
  font-weight: 700;
  font-size: 11px;
  white-space: nowrap;
  min-width: 36px;
  text-align: center;
  padding: 2px 8px;
  border-radius: 999px;
}

.lb-names { color: var(--color-text-primary); line-height: 1.5; }

/* ---------- 竞价异动 ---------- */
.jj-mini-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 280px;
  overflow-y: auto;
}

.jj-mini-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  font-size: 13px;
  border-radius: 6px;
  transition: background-color var(--transition-fast);
}

.jj-mini-item:hover { background: var(--color-bg-card-hover); }

.jj-name { flex: 1; color: var(--color-text-primary); font-weight: 500; }
.jj-pct { font-weight: 600; min-width: 65px; text-align: right; font-variant-numeric: tabular-nums; }
.jj-amt { color: var(--color-text-secondary); font-size: 12px; min-width: 44px; text-align: right; font-variant-numeric: tabular-nums; }

@media (max-width: 768px) {
  .home-grid { grid-template-columns: 1fr; }
  .index-strip { gap: 16px; padding: 10px 14px; }
  .index-item { padding-right: 16px; }
  .flow-amount { font-size: 26px; }
}
</style>
