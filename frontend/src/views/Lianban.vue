<script setup>
import { computed, onMounted } from 'vue'
import { useMarketStore } from '@/stores/market'

const store = useMarketStore()
onMounted(() => store.loadLianban())

const boardGradients = {
  7: 'linear-gradient(135deg, #ef4444, #dc2626)',
  6: 'linear-gradient(135deg, #f97316, #ea580c)',
  5: 'linear-gradient(135deg, #eab308, #ca8a04)',
  4: 'linear-gradient(135deg, #22c55e, #16a34a)',
  3: 'linear-gradient(135deg, #06b6d4, #0891b2)',
  2: 'linear-gradient(135deg, #6366f1, #4f46e5)',
}

const columns = [
  { prop: 'board', label: '板数', width: 65 },
  { prop: 'name', label: '股票', width: 95 },
  { prop: 'code', label: '代码', width: 75 },
  { prop: 'price', label: '现价', width: 72 },
  { prop: 'pct', label: '涨幅', width: 75 },
  { prop: 'turnover', label: '成交额(亿)', width: 95 },
  { prop: 'fengdan', label: '封单(亿)', width: 85 },
  { prop: 'marketVal', label: '流通市值(亿)', width: 105 },
  { prop: 'firstTime', label: '首封时间', width: 80 },
  { prop: 'industry', label: '行业', width: 100 },
]
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">连板排行</h2>
      <div class="header-actions">
        <span class="update-time">数据更新于 {{ new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }) }}</span>
        <el-button size="small" @click="store.refreshLianban()">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>
    </div>

    <div v-for="(stocks, board) in store.lianbanGroups" :key="board" class="board-group">
      <div class="board-header">
        <span class="board-badge" :style="{ background: boardGradients[stocks[0]?.board] || '#475569' }">
          {{ board }}
        </span>
        <span class="board-count">{{ stocks.length }}只</span>
        <span class="board-line" />
      </div>
      <el-table :data="stocks" size="small" stripe>
        <el-table-column v-for="col in columns" :key="col.prop" v-bind="col">
          <template v-if="col.prop === 'pct'" #default="{ row }">
            <span class="text-rise font-semibold">+{{ row.pct }}%</span>
          </template>
          <template v-else-if="col.prop === 'board'" #default="{ row }">
            <span class="board-badge-sm" :style="{ background: boardGradients[row.board] }">
              {{ row.board }}
            </span>
          </template>
          <template v-else-if="col.prop === 'name'" #default="{ row }">
            <span class="stock-name-link">{{ row.name }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped>
.header-actions { display: flex; align-items: center; gap: 12px; }
.update-time { font-size: 12px; color: var(--color-text-muted); }

.board-group { margin-bottom: 24px; }

.board-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.board-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 14px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  letter-spacing: 0.05em;
}
.board-badge-sm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  min-width: 28px;
}

.board-count { font-size: 12px; color: var(--color-text-secondary); font-weight: 500; }
.board-line { flex: 1; height: 1px; background: linear-gradient(90deg, var(--color-border), transparent); }

.stock-name-link { color: var(--color-text-primary); font-weight: 600; cursor: pointer; }
.stock-name-link:hover { color: #f87171; }
</style>
