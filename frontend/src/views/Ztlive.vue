<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchZtlive } from '@/api'

const REFRESH_INTERVAL = 5000

const initialLoading = ref(true)
const refreshing = ref(false)
const errorText = ref('')
const payload = ref({ list: [], plates: [], summary: null })
const activePlate = ref('')
const hideUnselected = ref(false)
const searchText = ref('')
const sortState = ref({ prop: 'firstTime', order: 'descending' })
const lastUpdatedAt = ref('')
let timerId = null

const summary = computed(() => payload.value.summary || {
  total: 0,
  sealed: 0,
  blown: 0,
  sealRate: 0,
  maxBoard: 0,
})

const dataDate = computed(() => payload.value.date || '--')
const isEmpty = computed(() => !initialLoading.value && !payload.value.list.length && !errorText.value)

const filteredRows = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()
  let rows = payload.value.list

  if (activePlate.value && hideUnselected.value) {
    rows = rows.filter((row) => row.plate === activePlate.value)
  }

  if (keyword) {
    rows = rows.filter((row) => (
      String(row.name).toLowerCase().includes(keyword)
      || String(row.code).toLowerCase().includes(keyword)
      || String(row.topic).toLowerCase().includes(keyword)
    ))
  }

  const { prop, order } = sortState.value
  if (!prop || !order) return rows

  return [...rows].sort((a, b) => {
    const left = sortableValue(a, prop)
    const right = sortableValue(b, prop)
    let result = 0

    if (typeof left === 'number' && typeof right === 'number') {
      result = (Number.isFinite(left) ? left : -Infinity) - (Number.isFinite(right) ? right : -Infinity)
    } else {
      result = String(left).localeCompare(String(right), 'zh-CN', { numeric: true })
    }

    return order === 'ascending' ? result : -result
  })
})

const visibleCountText = computed(() => {
  const total = payload.value.list.length
  const visible = filteredRows.value.length
  return total === visible ? `${total} 条` : `${visible} / ${total} 条`
})

function sortableValue(row, prop) {
  const numericProps = new Set([
    'pct', 'auctionPct', 'boardNumber', 'price', 'sealAmount', 'amount', 'turnoverRate', 'floatMarketCap',
  ])
  if (numericProps.has(prop)) return Number(row[prop])
  return row[prop] ?? ''
}

function formatNumber(value, digits = 2) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(digits) : '--'
}

function formatPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '--'
  return `${number >= 0 ? '+' : ''}${number.toFixed(2)}%`
}

function formatMoneyFromYuan(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '--'
  if (Math.abs(number) >= 100000000) return `${(number / 100000000).toFixed(2)}亿`
  return `${Math.round(number / 10000)}万`
}

function formatMarketCap(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '--'
  if (Math.abs(number) >= 100000000000) return `${(number / 100000000000).toFixed(1)}千亿`
  return `${(number / 100000000).toFixed(1)}亿`
}

function formatUpdatedAt(value = lastUpdatedAt.value) {
  if (!value) return '--'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function selectPlate(name) {
  activePlate.value = activePlate.value === name ? '' : name
}

function onSortChange({ prop, order }) {
  sortState.value = { prop, order }
}

async function loadData({ manual = false } = {}) {
  if (refreshing.value) return
  refreshing.value = true
  errorText.value = ''

  try {
    const next = await fetchZtlive()
    payload.value = {
      date: next?.date || '--',
      list: Array.isArray(next?.list) ? next.list : [],
      plates: Array.isArray(next?.plates) ? next.plates : [],
      summary: next?.summary || null,
    }
    lastUpdatedAt.value = next?.timestamp || new Date().toISOString()
  } catch (error) {
    errorText.value = error.response?.data?.error || '涨停播报暂时无法加载，请检查后端和数据源连接'
    if (manual) ElMessage.error(errorText.value)
  } finally {
    initialLoading.value = false
    refreshing.value = false
  }
}

function startPolling() {
  timerId = window.setInterval(() => {
    if (document.visibilityState === 'visible') loadData()
  }, REFRESH_INTERVAL)
}

onMounted(async () => {
  await loadData()
  startPolling()
})

onBeforeUnmount(() => {
  if (timerId) window.clearInterval(timerId)
})
</script>

<template>
  <div class="page ztlive-page">
    <div class="page-header ztlive-header">
      <div>
        <div class="page-kicker">LIMIT UP LIVE</div>
        <h2 class="page-title">涨停播报</h2>
        <p class="page-lead">实时观察涨停与炸板变化，按板块快速定位强势题材。</p>
      </div>
      <div class="header-actions">
        <div class="data-meta">
          <span>数据日期 {{ dataDate }}</span>
          <span>更新于 {{ formatUpdatedAt() }}</span>
        </div>
        <el-button size="small" :loading="refreshing" @click="loadData({ manual: true })">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>

    <section class="summary-strip">
      <div class="summary-card summary-total">
        <span>涨停播报</span>
        <strong>{{ summary.total }}</strong>
        <small>全部记录</small>
      </div>
      <div class="summary-card summary-sealed">
        <span>当前涨停</span>
        <strong>{{ summary.sealed }}</strong>
        <small>封板记录</small>
      </div>
      <div class="summary-card summary-blown">
        <span>炸板</span>
        <strong>{{ summary.blown }}</strong>
        <small>封板打开</small>
      </div>
      <div class="summary-card summary-rate">
        <span>封板率</span>
        <strong>{{ summary.sealRate }}%</strong>
        <small>涨停 / 全部</small>
      </div>
      <div class="summary-card summary-height">
        <span>最高连板</span>
        <strong>{{ summary.maxBoard || '--' }}<i v-if="summary.maxBoard">板</i></strong>
        <small>按数据源统计</small>
      </div>
    </section>

    <section class="filter-panel">
      <div class="filter-topline">
        <div>
          <span class="section-title">板块播报</span>
          <span class="section-caption">点击板块高亮，勾选后只保留该板块</span>
        </div>
        <div class="filter-tools">
          <el-input v-model="searchText" size="small" clearable placeholder="搜索股票 / 代码 / 题材" class="stock-search">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-checkbox v-model="hideUnselected" :disabled="!activePlate">只看选中板块</el-checkbox>
        </div>
      </div>

      <div class="plate-list" :class="{ 'is-loading': initialLoading }">
        <button
          type="button"
          class="plate-chip plate-chip-all"
          :class="{ active: !activePlate }"
          @click="activePlate = ''"
        >
          全部 <b>{{ summary.total }}</b>
        </button>
        <button
          v-for="plate in payload.plates"
          :key="plate.name"
          type="button"
          class="plate-chip"
          :class="{ active: activePlate === plate.name }"
          @click="selectPlate(plate.name)"
        >
          {{ plate.name }} <b>{{ plate.count }}</b><i v-if="plate.blown">:{{ plate.blown }}</i>
        </button>
        <span v-if="!loading && !payload.plates.length" class="empty-inline">暂无板块统计</span>
      </div>
    </section>

    <section class="table-panel">
      <div class="table-toolbar">
        <div>
          <span class="section-title">个股明细</span>
          <span class="section-caption">{{ visibleCountText }} · 每 5 秒自动刷新</span>
        </div>
        <span class="source-label">数据源：第三方公开行情快照</span>
      </div>

      <el-alert v-if="errorText" :title="errorText" type="error" show-icon :closable="false" class="ztlive-alert" />
      <el-skeleton v-else-if="initialLoading" :rows="8" animated />
      <el-empty v-else-if="isEmpty" description="当前没有涨停播报数据" />
      <el-table
        v-else
        v-loading="refreshing"
        element-loading-text="数据更新中…"
        element-loading-background="rgba(15, 23, 42, 0.55)"
        :data="filteredRows"
        size="small"
        stripe
        row-key="id"
        height="calc(100vh - 430px)"
        min-height="360"
        @sort-change="onSortChange"
      >
        <el-table-column prop="name" label="股票" min-width="105" fixed="left">
          <template #default="{ row }"><span class="stock-name">{{ row.name }}</span></template>
        </el-table-column>
        <el-table-column prop="code" label="代码" width="78" />
        <el-table-column prop="status" label="状态" width="70" sortable="custom">
          <template #default="{ row }"><span :class="row.status === '涨停' ? 'text-rise' : 'text-fall'">{{ row.status }}</span></template>
        </el-table-column>
        <el-table-column prop="boardNumber" label="连板" width="88" sortable="custom">
          <template #default="{ row }"><span class="board-pill">{{ row.board }}</span></template>
        </el-table-column>
        <el-table-column prop="pct" label="涨幅" width="78" sortable="custom">
          <template #default="{ row }"><span class="text-rise">{{ formatPercent(row.pct) }}</span></template>
        </el-table-column>
        <el-table-column prop="sealAmount" label="封单" width="86" sortable="custom">
          <template #default="{ row }"><span :class="row.status === '涨停' ? 'text-rise' : 'muted-value'">{{ row.sealAmountText }}</span></template>
        </el-table-column>
        <el-table-column prop="firstTime" label="首封" width="86" sortable="custom" />
        <el-table-column prop="plate" label="板块" min-width="105" show-overflow-tooltip />
        <el-table-column prop="price" label="价格" width="76" sortable="custom">
          <template #default="{ row }">{{ formatNumber(row.price) }}</template>
        </el-table-column>
        <el-table-column prop="auctionPct" label="竞价涨幅" width="100" sortable="custom">
          <template #default="{ row }"><span :class="Number(row.auctionPct) >= 0 ? 'text-rise' : 'text-fall'">{{ formatPercent(row.auctionPct) }}</span></template>
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
        <el-table-column prop="topic" label="题材" min-width="150" show-overflow-tooltip />
      </el-table>
    </section>
  </div>
</template>

<style scoped>
.ztlive-page {
  max-width: 1500px;
}

.ztlive-header {
  align-items: flex-start;
}

.page-kicker {
  margin-bottom: 6px;
  color: #f97316;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
}

.page-lead {
  margin: 8px 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.header-actions,
.data-meta,
.filter-tools,
.filter-topline,
.table-toolbar {
  display: flex;
  align-items: center;
}

.header-actions {
  gap: 14px;
}

.data-meta {
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  color: var(--color-text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.summary-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}

.summary-card {
  flex: 1 1 150px;
  min-width: 130px;
  padding: 15px 16px;
  border: 1px solid var(--color-border);
  border-top: 2px solid #64748b;
  border-radius: 9px;
  background: linear-gradient(135deg, rgba(20, 30, 48, 0.96), rgba(16, 24, 39, 0.92));
}

.summary-card span,
.summary-card small {
  display: block;
}

.summary-card span {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.summary-card strong {
  display: block;
  margin: 7px 0 4px;
  color: var(--color-text-primary);
  font-size: 26px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.summary-card strong i {
  margin-left: 2px;
  font-size: 13px;
  font-style: normal;
}

.summary-card small {
  color: var(--color-text-muted);
  font-size: 11px;
}

.summary-total { border-top-color: #f97316; }
.summary-sealed { border-top-color: #ef4444; }
.summary-blown { border-top-color: #22c55e; }
.summary-rate { border-top-color: #eab308; }
.summary-height { border-top-color: #38bdf8; }
.summary-sealed strong { color: #f87171; }
.summary-blown strong { color: #4ade80; }
.summary-rate strong { color: #facc15; }
.summary-height strong { color: #38bdf8; }

.filter-panel,
.table-panel {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-card);
}

.filter-panel {
  margin-bottom: 14px;
  padding: 15px 16px 12px;
}

.filter-topline,
.table-toolbar {
  justify-content: space-between;
  gap: 14px;
}

.section-title {
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: 800;
}

.section-caption {
  margin-left: 10px;
  color: var(--color-text-muted);
  font-size: 12px;
}

.filter-tools {
  gap: 14px;
}

.stock-search {
  width: 210px;
}

.plate-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  max-height: 108px;
  margin-top: 14px;
  overflow-y: auto;
}

.plate-chip {
  border: 1px solid rgba(90, 110, 136, 0.55);
  border-radius: 5px;
  padding: 5px 9px;
  background: rgba(90, 110, 136, 0.1);
  color: var(--color-text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  transition: all 0.16s ease;
}

.plate-chip b {
  margin-left: 4px;
  color: #f87171;
  font-size: 11px;
}

.plate-chip i {
  margin-left: 3px;
  color: #4ade80;
  font-size: 11px;
  font-style: normal;
}

.plate-chip:hover,
.plate-chip.active {
  border-color: rgba(248, 113, 113, 0.65);
  background: rgba(239, 68, 68, 0.13);
  color: #fca5a5;
}

.plate-chip-all b { color: #f97316; }
.empty-inline { color: var(--color-text-muted); font-size: 12px; }

.table-panel {
  padding: 16px;
}

.table-toolbar {
  margin-bottom: 13px;
}

.source-label {
  color: var(--color-text-muted);
  font-size: 11px;
}

.ztlive-alert {
  margin-bottom: 12px;
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
  color: #fdba74;
  font-size: 11px;
  font-weight: 700;
}

.muted-value { color: var(--color-text-muted); }

@media (max-width: 900px) {
  .filter-topline,
  .table-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .filter-tools {
    width: 100%;
    justify-content: space-between;
  }
}

@media (max-width: 620px) {
  .header-actions,
  .filter-tools {
    align-items: stretch;
    flex-direction: column;
    width: 100%;
  }

  .data-meta { align-items: flex-start; }
  .stock-search { width: 100%; }
  .summary-card { flex-basis: calc(50% - 6px); min-width: 0; }
  .table-panel { padding: 10px; }
}
</style>
