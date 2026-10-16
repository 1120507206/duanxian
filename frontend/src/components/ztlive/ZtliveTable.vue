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

/**
 * 事件流推送进来的新行会带 `__fresh` 标记（由 useZtliveFeed 在 6 秒后清除）。
 * 高亮用行级 class 而不是改单元格内容：单元格是纯数据展示，混入状态会让
 * 排序、筛选、导出这些后续功能都得额外绕开它。
 */
function rowClassName({ row }) {
  if (!row?.__fresh) return ''
  return row.status === '涨停' ? 'zt-row-fresh zt-row-fresh-rise' : 'zt-row-fresh zt-row-fresh-fall'
}
</script>

<template>
  <el-table
    v-loading="loading"
    element-loading-text="数据更新中…"
    :data="rows"
    size="small"
    stripe
    row-key="id"
    :row-class-name="rowClassName"
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

/*
 * 刚由封板事件推送进来的行：短暂染色，让「哪一只刚封板」一眼可见。
 *
 * 必须用 !important —— el-table 的斑马纹规则（.el-table--striped .el-table__body
 * tr.el-table__row--striped td.el-table__cell）权重是 (0,4,2)，常规选择器压不过它，
 * 不加会被斑马纹的底色盖掉，表现为「高亮只在部分行生效」。
 *
 * 颜色沿用 A 股习惯：涨停=红、炸板=绿。
 */
:deep(.el-table__row.zt-row-fresh-rise > td) {
  background-color: rgba(239, 68, 68, 0.18) !important;
}

:deep(.el-table__row.zt-row-fresh-fall > td) {
  background-color: rgba(34, 197, 94, 0.18) !important;
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

