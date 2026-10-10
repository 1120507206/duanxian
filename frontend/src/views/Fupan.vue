<script setup>
import { nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import { useMarketStore } from '@/stores/market'
import * as echarts from 'echarts'
import dayjs from 'dayjs'

const store = useMarketStore()
const fupanDate = ref(dayjs().format('YYYY-MM-DD'))
const chartRef = ref(null)
let chart = null

function initChart() {
  if (!chartRef.value || !store.fupanData.sentiment?.length) return

  chart?.dispose()
  chart = echarts.init(chartRef.value, 'dark')
  chart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { top: 10, right: 20, bottom: 10, left: 42 },
    xAxis: { type: 'category', data: store.fupanData.sentiment.map(s => s.time), axisLabel: { fontSize: 10, color: '#8fa0b8' } },
    yAxis: { type: 'value', min: 0, max: 100, axisLabel: { fontSize: 10, color: '#8fa0b8' } },
    series: [{
      type: 'line', data: store.fupanData.sentiment.map(s => s.value), smooth: true,
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(239,68,68,0.3)' }, { offset: 1, color: 'rgba(239,68,68,0)' },
      ])},
      lineStyle: { color: '#ef4444', width: 2.5 }, symbol: 'circle', symbolSize: 5,
    }],
  })
}

async function loadFupanView(date) {
  await store.loadFupan(date)
  await nextTick()
  initChart()
}

async function changeDate(delta) {
  fupanDate.value = dayjs(fupanDate.value).add(delta, 'day').format('YYYY-MM-DD')
  await loadFupanView(fupanDate.value)
}

async function onDateChange(value) {
  if (!value) return
  fupanDate.value = dayjs(value).format('YYYY-MM-DD')
  await loadFupanView(fupanDate.value)
}

async function resetToToday() {
  fupanDate.value = dayjs().format('YYYY-MM-DD')
  await loadFupanView(fupanDate.value)
}

onMounted(async () => {
  await loadFupanView(fupanDate.value)
})
onBeforeUnmount(() => chart?.dispose())
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">每日复盘</h2>
      <div class="date-picker-row">
        <el-button size="small" @click="changeDate(-1)"><el-icon><ArrowLeft /></el-icon></el-button>
        <el-date-picker v-model="fupanDate" type="date" size="small" style="width:148px"
          @change="onDateChange" />
        <el-button size="small" @click="changeDate(1)"><el-icon><ArrowRight /></el-icon></el-button>
        <el-button size="small" @click="resetToToday">
          今天
        </el-button>
      </div>
    </div>

    <!-- 复盘概览统计 -->
    <div class="fupan-stats">
      <div class="fp-stat stat-zt">
        <span class="fp-stat-icon">Z</span>
        <div>
          <span class="fp-stat-label">涨停</span>
          <span class="fp-stat-value text-rise">{{ store.fupanData.ztCount }}</span>
        </div>
      </div>
      <div class="fp-stat stat-dt">
        <span class="fp-stat-icon">D</span>
        <div>
          <span class="fp-stat-label">跌停</span>
          <span class="fp-stat-value text-fall">{{ store.fupanData.dtCount }}</span>
        </div>
      </div>
      <div class="fp-stat stat-zb">
        <span class="fp-stat-icon">Z</span>
        <div>
          <span class="fp-stat-label">炸板</span>
          <span class="fp-stat-value" style="color:#f97316">{{ store.fupanData.zbCount }}</span>
        </div>
      </div>
      <div class="fp-stat stat-fb">
        <span class="fp-stat-icon">F</span>
        <div>
          <span class="fp-stat-label">反包</span>
          <span class="fp-stat-value" style="color:#22d3ee">{{ store.fupanData.fbCount }}</span>
        </div>
      </div>
    </div>

    <!-- 情绪走势图 -->
    <div class="card mb-4">
      <div class="card-header"><span class="card-title">情绪走势</span></div>
      <div ref="chartRef" style="height:220px" />
    </div>

    <!-- 热门板块 -->
    <div class="card mb-4">
      <div class="card-header"><span class="card-title">热门板块</span></div>
      <div class="fp-plate-list">
        <div v-for="p in store.fupanData.hotPlates" :key="p.name" class="fp-plate-item">
          <div class="fp-plate-main">
            <span class="fp-plate-name">{{ p.name }}</span>
            <span class="text-rise font-semibold">{{ p.ztCount }}只涨停</span>
          </div>
          <div class="fp-plate-leader">
            龙头 <span class="text-rise font-medium">{{ p.leaderName }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 涨停统计 & 成交额排名 -->
    <div class="fp-bottom-grid">
      <div class="card">
        <div class="card-header"><span class="card-title">涨停股池</span></div>
        <el-table :data="store.fupanData.topZt" size="small" max-height="380">
          <el-table-column prop="name" label="股票" width="85" />
          <el-table-column prop="board" label="板数" width="55">
            <template #default="{ row }">
              <span class="board-mini">{{ row.board }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="pct" label="涨幅" width="75">
            <template #default="{ row }"><span class="text-rise font-medium">+{{ row.pct }}%</span></template>
          </el-table-column>
          <el-table-column prop="industry" label="行业" />
        </el-table>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">成交额排名</span></div>
        <el-table :data="store.fupanData.topAmount" size="small" max-height="380">
          <el-table-column prop="name" label="股票" width="85" />
          <el-table-column prop="amount" label="成交额(亿)" width="95">
            <template #default="{ row }"><span class="text-rise font-medium">{{ row.amount }}</span></template>
          </el-table-column>
          <el-table-column prop="pct" label="涨幅">
            <template #default="{ row }"><span class="text-rise">+{{ row.pct }}%</span></template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.date-picker-row { display: flex; align-items: center; gap: 6px; }

.fupan-stats { display: flex; gap: 14px; margin-bottom: 18px; }
.fp-stat {
  flex: 1;
  background: linear-gradient(135deg, #141e30, #1a2740);
  border: 1px solid #1e3a5f;
  border-radius: 10px;
  padding: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all 0.3s;
}
.fp-stat:hover { border-color: #253d5f; transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.3); }

.fp-stat-icon {
  width: 36px; height: 36px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-weight: 900; font-size: 15px; color: #fff; flex-shrink: 0;
}
.stat-zt .fp-stat-icon { background: linear-gradient(135deg, #ef4444, #dc2626); }
.stat-dt .fp-stat-icon { background: linear-gradient(135deg, #22c55e, #16a34a); }
.stat-zb .fp-stat-icon { background: linear-gradient(135deg, #f97316, #ea580c); }
.stat-fb .fp-stat-icon { background: linear-gradient(135deg, #06b6d4, #0891b2); }

.fp-stat-label { display: block; font-size: 11px; color: #8fa0b8; margin-bottom: 2px; }
.fp-stat-value { font-size: 22px; font-weight: 800; }

.fp-plate-list { display: flex; flex-direction: column; gap: 4px; }
.fp-plate-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 10px; border-radius: 6px; transition: background 0.15s;
}
.fp-plate-item:hover { background: rgba(255,255,255,0.02); }
.fp-plate-main { display: flex; align-items: center; gap: 12px; }
.fp-plate-name { font-weight: 600; color: #e8edf5; }
.fp-plate-leader { font-size: 12px; color: #8fa0b8; }

.fp-bottom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

.board-mini {
  display: inline-flex;
  align-items: center; justify-content: center;
  padding: 1px 7px; border-radius: 4px;
  font-size: 11px; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, #f97316, #ea580c);
  min-width: 22px;
}

@media (max-width: 768px) {
  .fupan-stats { flex-wrap: wrap; }
  .fp-stat { min-width: calc(50% - 7px); flex: none; }
  .fp-bottom-grid { grid-template-columns: 1fr; }
}
</style>
