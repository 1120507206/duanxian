<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useMarketStore } from '@/stores/market'
import * as echarts from 'echarts'

const store = useMarketStore()
const chartRef = ref(null)
let chart = null

function initChart() {
  if (!chartRef.value || !store.zijinList.length) return

  chart?.dispose()
  chart = echarts.init(chartRef.value, 'dark')
  const sorted = [...store.zijinList].sort((a, b) => Number(b.totalIn) - Number(a.totalIn))
  const reversedNames = [...sorted].reverse().map((item) => item.name)
  const reversedBarData = [...sorted].reverse().map((item) => ({
    name: item.name,
    value: Math.abs(Number(item.totalIn)),
    itemStyle: {
      color: Number(item.totalIn) >= 0
        ? new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#dc2626' }, { offset: 1, color: '#ef4444' }])
        : new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#16a34a' }, { offset: 1, color: '#22c55e' }]),
      borderRadius: 4,
    },
  }))

  const data = sorted.map((p) => ({
    name: p.name,
    value: Math.abs(Number(p.totalIn)),
    itemStyle: {
      color: Number(p.totalIn) >= 0
        ? new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#dc2626' }, { offset: 1, color: '#ef4444' }])
        : new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#16a34a' }, { offset: 1, color: '#22c55e' }]),
      borderRadius: 4,
    },
  }))
  chart.setOption({
    tooltip: { trigger: 'axis', formatter: (p) => `${p[0].name}: ${reversedBarData[p[0].dataIndex].name ? [...sorted].reverse()[p[0].dataIndex].totalIn : 0}亿` },
    grid: { top: 10, right: 50, bottom: 10, left: 80 },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', data: reversedNames, axisLabel: { fontSize: 11, color: '#8fa0b8', fontWeight: 500 } },
    series: [{
      type: 'bar',
      data: reversedBarData,
      barWidth: 14,
      label: {
        show: true,
        position: 'right',
        fontSize: 10,
        color: '#8fa0b8',
        formatter: (p) => `${[...sorted].reverse()[p.dataIndex].totalIn}亿`,
      },
    }],
  })
}

onMounted(async () => {
  await store.loadZijin()
  initChart()
})
onBeforeUnmount(() => chart?.dispose())
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">资金流向</h2>
      <div class="header-actions">
        <span class="update-time">{{ new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }) }}</span>
        <el-button size="small" @click="store.refreshZijin().then(initChart)">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>
    </div>

    <div class="card mb-4">
      <div class="card-header"><span class="card-title">板块资金净流入排行</span></div>
      <div ref="chartRef" style="height:440px" />
    </div>

    <div class="zijin-grid">
      <div v-for="item in store.zijinList" :key="item.name" class="zijin-card" :class="Number(item.totalIn) >= 0 ? 'zj-inflow' : 'zj-outflow'">
        <div class="zj-header">
          <span class="zj-name">{{ item.name }}</span>
          <span :class="['zj-total', Number(item.totalIn) >= 0 ? 'text-rise' : 'text-fall']">
            {{ Number(item.totalIn) >= 0 ? '+' : '' }}{{ item.totalIn }}亿
          </span>
        </div>
        <div class="zj-detail">
          <span class="zj-sub">
            <span class="zj-sub-dot bg-rise-soft" />主力 {{ Number(item.mainIn) >= 0 ? '+' : '' }}{{ item.mainIn }}亿
          </span>
          <span class="zj-sub">
            <span class="zj-sub-dot bg-fall-soft" />超大单 {{ Number(item.superIn) >= 0 ? '+' : '' }}{{ item.superIn }}亿
          </span>
        </div>
        <div class="zj-leader" v-if="item.topStocks?.[0]?.name">
          <span class="zj-leader-label">领涨</span>
          <span class="zj-leader-name">{{ item.topStocks[0].name }}</span>
          <span class="text-rise text-xs font-semibold">+{{ item.topStocks[0].pct }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.header-actions { display: flex; align-items: center; gap: 12px; }
.update-time { font-size: 12px; color: #5a6e88; }

.zijin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.zijin-card {
  background: linear-gradient(135deg, #141e30, #1a2740);
  border: 1px solid #1e3a5f;
  border-radius: 10px;
  padding: 16px;
  transition: all 0.3s;
}
.zijin-card:hover { border-color: #253d5f; transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
.zj-inflow { border-top: 2px solid #ef4444; }
.zj-outflow { border-top: 2px solid #22c55e; }

.zj-header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;
}
.zj-name { font-size: 15px; font-weight: 700; color: #e8edf5; }
.zj-total { font-size: 16px; font-weight: 800; }

.zj-detail { display: flex; gap: 16px; font-size: 12px; color: #8fa0b8; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid rgba(30,58,95,0.5); }
.zj-sub { display: flex; align-items: center; gap: 4px; }
.zj-sub-dot { width: 5px; height: 5px; border-radius: 50%; }

.zj-leader { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.zj-leader-label { color: #5a6e88; }
.zj-leader-name { color: #c8d6e5; font-weight: 600; }
</style>
