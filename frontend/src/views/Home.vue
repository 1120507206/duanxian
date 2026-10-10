<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import * as echarts from 'echarts'
import { useMarketStore } from '@/stores/market'

const store = useMarketStore()
const sentimentChartRef = ref(null)
const flowChartRef = ref(null)
let sentimentChart = null
let flowChart = null

const riseCount = computed(() => store.sentiment.upCount)
const fallCount = computed(() => store.sentiment.downCount)

function initSentimentChart() {
  if (!sentimentChartRef.value) return

  sentimentChart?.dispose()
  sentimentChart = echarts.init(sentimentChartRef.value, 'dark')
  sentimentChart.setOption({
    grid: { top: 8, right: 8, bottom: 8, left: 36 },
    xAxis: {
      type: 'category',
      data: ['封板率', '连板高度', '上涨家数', '下跌家数'],
      axisLabel: { fontSize: 10, color: '#8fa0b8' },
    },
    yAxis: { type: 'value', show: false, min: 0 },
    series: [{
      type: 'bar',
      barWidth: 20,
      data: [
        {
          value: store.sentiment.ztRatio,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#ef4444' },
              { offset: 1, color: '#dc2626' },
            ]),
          },
        },
        {
          value: store.sentiment.lianbanHeight * 10,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#f97316' },
              { offset: 1, color: '#ea580c' },
            ]),
          },
        },
        {
          value: store.sentiment.upCount / 100,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#ef4444' },
              { offset: 1, color: '#dc2626' },
            ]),
          },
        },
        {
          value: store.sentiment.downCount / 100,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#22c55e' },
              { offset: 1, color: '#16a34a' },
            ]),
          },
        },
      ],
    }],
  })
}

function initFlowChart() {
  if (!flowChartRef.value) return

  flowChart?.dispose()
  flowChart = echarts.init(flowChartRef.value, 'dark')
  flowChart.setOption({
    grid: { top: 10, right: 10, bottom: 10, left: 40 },
    xAxis: {
      type: 'category',
      data: ['09:30', '10:00', '10:30', '11:00', '11:30', '13:30', '14:00', '14:30', '15:00'],
      axisLabel: { fontSize: 10, color: '#8fa0b8' },
    },
    yAxis: { type: 'value', show: false, min: 0 },
    series: [{
      type: 'line',
      data: [120, 200, 180, 250, 300, 280, 350, 400, 380],
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
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
}

async function refreshHomeSummary() {
  await store.refreshHome()
  initSentimentChart()
}

onMounted(async () => {
  await loadHomeView()
})

onBeforeUnmount(() => {
  sentimentChart?.dispose()
  flowChart?.dispose()
})
</script>

<template>
  <div class="home-page">
    <div class="index-strip">
      <div v-for="item in store.indices" :key="item.code" class="index-item">
        <span class="idx-name">{{ item.name }}</span>
        <span class="idx-value">{{ Number(item.value).toFixed(2) }}</span>
        <span :class="['idx-change', Number(item.pct) >= 0 ? 'text-rise' : 'text-fall']">
          <span class="idx-arrow">{{ Number(item.pct) >= 0 ? '▲' : '▼' }}</span>
          {{ Number(item.pct) >= 0 ? '+' : '' }}{{ Number(item.pct).toFixed(2) }}%
        </span>
      </div>
      <div class="ml-auto index-time">
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
          <div class="sent-item stat-animate">
            <span class="sent-label">涨停家数</span>
            <span class="sent-value text-rise">{{ store.sentiment.ztCount }}</span>
          </div>
          <div class="sent-item stat-animate">
            <span class="sent-label">跌停家数</span>
            <span class="sent-value text-fall">{{ store.sentiment.dtCount }}</span>
          </div>
          <div class="sent-item stat-animate">
            <span class="sent-label">封板率</span>
            <span class="sent-value text-rise">{{ store.sentiment.ztRatio }}%</span>
          </div>
          <div class="sent-item stat-animate">
            <span class="sent-label">连板高度</span>
            <span class="sent-value" style="color:#f97316">{{ store.sentiment.lianbanHeight }}板</span>
          </div>
          <div class="sent-item stat-animate">
            <span class="sent-label">上涨家数</span>
            <span class="sent-value text-rise">{{ riseCount }}</span>
          </div>
          <div class="sent-item stat-animate">
            <span class="sent-label">下跌家数</span>
            <span class="sent-value text-fall">{{ fallCount }}</span>
          </div>
        </div>
        <div ref="sentimentChartRef" class="mini-chart" />
      </div>

      <div class="card glow-border">
        <div class="card-header">
          <span class="card-title">主力资金流向</span>
        </div>
        <div class="flow-big-number">
          <span class="flow-amount" :class="store.sentiment.mainFlow >= 0 ? 'text-rise' : 'text-fall'">
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
              <span class="font-medium text-rise">+{{ row.pct }}%</span>
            </template>
          </el-table-column>
          <el-table-column prop="buyTotal" label="买入(万)" width="90">
            <template #default="{ row }">
              <span class="font-medium text-rise">{{ row.buyTotal }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="sellTotal" label="卖出(万)" width="90">
            <template #default="{ row }">
              <span class="text-fall">{{ row.sellTotal }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="netFlow" label="净买(万)">
            <template #default="{ row }">
              <span :class="Number(row.netFlow) >= 0 ? 'text-rise font-medium' : 'text-fall'">{{ row.netFlow }}</span>
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
            <span :class="['jj-pct', Number(item.jjPct) >= 0 ? 'text-rise' : 'text-fall']">
              {{ Number(item.jjPct) >= 0 ? '+' : '' }}{{ item.jjPct }}%
            </span>
            <span class="jj-amt">{{ item.jjAmount }}亿</span>
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

.index-strip {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 14px 20px;
  margin-bottom: 18px;
  background: linear-gradient(135deg, #141e30, #1a2740);
  border: 1px solid #1e3a5f;
  border-radius: 10px;
  overflow-x: auto;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
}

.index-item {
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}

.idx-name { font-size: 12px; color: #8fa0b8; font-weight: 500; min-width: 60px; }
.idx-value { font-size: 15px; font-weight: 700; color: #e8edf5; font-variant-numeric: tabular-nums; }
.idx-change { font-size: 13px; font-weight: 600; }
.idx-arrow { font-size: 10px; margin-right: 1px; }

.index-time {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #8fa0b8;
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

.home-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;

  gap: 14px;
}

.sentiment-card { grid-row: span 2; }

.sentiment-grid {

  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 14px;
}

.sent-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
  border: 1px solid rgba(30, 58, 95, 0.4);
}

.sent-label { font-size: 11px; color: #8fa0b8; font-weight: 500; }
.sent-value { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }

.flow-big-number {
  text-align: center;
  padding: 16px 0 8px;
}

.flow-amount { font-size: 32px; font-weight: 900; letter-spacing: -0.5px; }
.flow-unit { font-size: 16px; font-weight: 600; }

.flow-meta {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 6px;
  font-size: 12px;
  color: #8fa0b8;
}

.flow-label { font-weight: 600; }
.mini-chart { height: 150px; }

.more-link {
  font-size: 12px;
  color: #5a6e88;
  text-decoration: none;
  transition: color 0.2s;
}

.more-link:hover { color: #f87171; }
.lb-card { grid-row: span 1; }

.lb-row {
  display: flex;
  gap: 8px;
  padding: 5px 0;
  font-size: 13px;
  transition: background 0.15s;
}

.lb-row:hover {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 4px;
  padding-left: 4px;
  padding-right: 4px;
}

.lb-board {
  background: linear-gradient(135deg, #ef4444, #f97316);
  color: #fff;
  font-weight: 700;
  font-size: 11px;
  white-space: nowrap;
  min-width: 36px;
  text-align: center;
  padding: 1px 6px;
  border-radius: 4px;
}

.lb-names { color: #c8d6e5; line-height: 1.5; }

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
  padding: 6px 8px;
  font-size: 13px;
  border-radius: 6px;
  transition: background 0.15s;
}

.jj-mini-item:hover { background: rgba(255, 255, 255, 0.03); }

.jj-name { flex: 1; color: #e8edf5; font-weight: 500; }
.jj-pct { font-weight: 600; min-width: 65px; text-align: right; }
.jj-amt { color: #8fa0b8; font-size: 12px; min-width: 44px; text-align: right; }

@media (max-width: 768px) {
  .home-grid { grid-template-columns: 1fr; }
  .index-strip { gap: 16px; padding: 10px 14px; }
  .flow-amount { font-size: 26px; }
}
</style>
