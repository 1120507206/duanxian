<script setup>
import { computed, onMounted } from 'vue'
import { useMarketStore } from '@/stores/market'

const store = useMarketStore()
onMounted(() => store.loadJingjia())

const columns = [
  { prop: 'name', label: '股票', width: 95 },
  { prop: 'code', label: '代码', width: 75 },
  { prop: 'jjPct', label: '竞价涨幅', width: 95 },
  { prop: 'jjAmount', label: '竞价金额(亿)', width: 110 },
  { prop: 'openPct', label: '开盘涨幅', width: 95 },
  { prop: 'price', label: '现价', width: 75 },
  { prop: 'ztBoard', label: '连板', width: 55 },
]

const sortedList = computed(() => {
  return [...store.jingjiaList].sort((a, b) => Number(b.jjPct) - Number(a.jjPct))
})

const statsData = computed(() => [
  { label: '竞价涨停', value: sortedList.value.filter(s => Number(s.jjPct) >= 9.8).length, type: 'rise' },
  { label: '竞价+5%以上', value: sortedList.value.filter(s => Number(s.jjPct) >= 5).length, type: 'rise' },
  { label: '竞价红盘', value: sortedList.value.filter(s => Number(s.jjPct) > 0).length, type: 'rise' },
  { label: '竞价绿盘', value: sortedList.value.filter(s => Number(s.jjPct) < 0).length, type: 'fall' },
])
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">集合竞价分析</h2>
      <div class="header-actions">
        <span class="update-time">{{ new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }) }}</span>
        <el-button size="small" @click="store.refreshJingjia()">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>
    </div>

    <!-- 竞价强度统计 -->
    <div class="jj-stats-row">
      <div v-for="stat in statsData" :key="stat.label" class="jj-stat" :class="`jj-stat-${stat.type}`">
        <span class="jj-stat-label">{{ stat.label }}</span>
        <span class="jj-stat-val" :class="stat.type === 'rise' ? 'text-rise' : 'text-fall'">{{ stat.value }}</span>
      </div>
    </div>

    <el-table :data="sortedList" size="small" stripe max-height="calc(100vh - 220px)">
      <el-table-column v-for="col in columns" :key="col.prop" v-bind="col">
        <template v-if="col.prop === 'jjPct'" #default="{ row }">
          <span :class="Number(row.jjPct) >= 0 ? 'text-rise' : 'text-fall'" class="font-semibold">
            {{ Number(row.jjPct) >= 0 ? '+' : '' }}{{ row.jjPct }}%
          </span>
        </template>
        <template v-else-if="col.prop === 'openPct'" #default="{ row }">
          <span :class="Number(row.openPct) >= 0 ? 'text-rise' : 'text-fall'">
            {{ Number(row.openPct) >= 0 ? '+' : '' }}{{ row.openPct }}%
          </span>
        </template>
        <template v-else-if="col.prop === 'ztBoard'" #default="{ row }">
          <span v-if="row.ztBoard > 0" class="board-mini">{{ row.ztBoard }}</span>
          <span v-else class="text-slate-600">-</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.header-actions { display: flex; align-items: center; gap: 12px; }
.update-time { font-size: 12px; color: #5a6e88; }

.jj-stats-row { display: flex; gap: 14px; margin-bottom: 18px; }
.jj-stat {
  flex: 1;
  background: linear-gradient(135deg, #141e30, #1a2740);
  border: 1px solid #1e3a5f;
  border-radius: 10px;
  padding: 14px;
  text-align: center;
  transition: all 0.3s;
}
.jj-stat:hover { border-color: #253d5f; transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
.jj-stat-rise { border-left: 3px solid #ef4444; }
.jj-stat-fall { border-left: 3px solid #22c55e; }
.jj-stat-label { display: block; font-size: 12px; color: #8fa0b8; margin-bottom: 6px; font-weight: 500; }
.jj-stat-val { font-size: 28px; font-weight: 800; }

.board-mini {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #f97316, #ea580c);
  min-width: 20px;
}
</style>
