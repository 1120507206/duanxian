<script setup>
import {
  formatMarketCap,
  formatMoneyFromYuan,
  formatNumber,
  formatPercent,
} from '@/utils/ztliveFormat'

defineProps({
  rows: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  /** 通达信独立页窄栏用紧凑列集 */
  compact: { type: Boolean, default: false },
  height: { type: String, default: 'calc(100vh - 430px)' },
  minHeight: { type: String, default: '360' },
})

defineEmits(['sort-change'])
</script>

<template>
  <el-table
    v-loading="loading"
    element-loading-text="数据更新中…"
    :data="rows"
    size="small"
    stripe
    row-key="id"
    :height="height"
    :min-height="minHeight"
    @sort-change="(payload) => $emit('sort-change', payload)"
  >
    <el-table-column prop="name" label="股票" min-width="105" fixed="left">
      <template #default="{ row }"><span class="stock-name">{{ row.name }}</span></template>
    </el-table-column>
    <el-table-column prop="code" label="代码" width="78" />
    <el-table-column prop="status" label="状态" width="70" sortable="custom">
      <template #default="{ row }">
        <span :class="row.status === '涨停' ? 'text-rise' : 'text-fall'">{{ row.status }}</span>
      </template>
    </el-table-column>
    <el-table-column prop="boardNumber" label="连板" width="88" sortable="custom">
      <template #default="{ row }"><span class="board-pill">{{ row.board }}</span></template>
    </el-table-column>
    <el-table-column prop="pct" label="涨幅" width="78" sortable="custom">
      <template #default="{ row }"><span class="text-rise">{{ formatPercent(row.pct) }}</span></template>
    </el-table-column>
    <el-table-column prop="sealAmount" label="封单" width="86" sortable="custom">
      <template #default="{ row }">
        <span :class="row.status === '涨停' ? 'text-rise' : 'muted-value'">{{ row.sealAmountText }}</span>
      </template>
    </el-table-column>
    <el-table-column prop="firstTime" label="首封" width="86" sortable="custom" />
    <el-table-column prop="plate" label="板块" min-width="105" show-overflow-tooltip />
    <template v-if="!compact">
      <el-table-column prop="price" label="价格" width="76" sortable="custom">
        <template #default="{ row }">{{ formatNumber(row.price) }}</template>
      </el-table-column>
      <el-table-column prop="auctionPct" label="竞价涨幅" width="100" sortable="custom">
        <template #default="{ row }">
          <span :class="Number(row.auctionPct) >= 0 ? 'text-rise' : 'text-fall'">{{ formatPercent(row.auctionPct) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="amount" label="成交额" width="88" sortable="custom">
        <template #default="{ row }">{{ row.amountText || formatMoneyFromYuan(row.amount) }}</template>
      </el-table-column>
      <el-table-column prop="endTime" label="终封" width="86" sortable="custom" />
      <el-table-column prop="turnoverRate" label="换手" width="76" sortable="custom">
        <template #default="{ row }">{{ formatPercent(row.turnoverRate) }}</template>
      </el-table-column>
      <el-table-column prop="floatMarketCap" label="流通市值" width="100" sortable="custom">
        <template #default="{ row }">{{ formatMarketCap(row.floatMarketCap) }}</template>
      </el-table-column>
    </template>
    <el-table-column prop="topic" label="题材" min-width="150" show-overflow-tooltip />
  </el-table>
</template>

<style scoped>
/* 加载遮罩底色跟随主题，避免浅色下盖上一层深色蒙版 */
:deep(.el-loading-mask) {
  background-color: var(--color-bg-card);
  opacity: 0.72;
}

.stock-name {
  color: var(--color-text-primary);
  font-weight: 700;
}

.board-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  padding: 3px 6px;
  border-radius: 4px;
  background: rgba(249, 115, 22, 0.16);
  color: #c2410c;
  font-size: 11px;
  font-weight: 700;
}

html.dark .board-pill { color: #fdba74; }

.muted-value { color: var(--color-text-muted); }
</style>

