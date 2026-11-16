<script setup>
/**
 * 涨停播报原生表格（通达信独立页专用）。
 *
 * 参考旧项目 `duanxianxai-vue3/new-vue3/src/components/common/NativeTable.vue`
 * 的实现思路，但只保留这张表真正需要的能力：
 *   ✅ 原生 <table>，无 el-table 的多层 wrapper
 *   ✅ sticky 表头 + 纵向 / 横向滚动
 *   ✅ 列宽按 el-table 口径分配（固定列原样、弹性列按 minWidth 分剩余空间）
 *   ✅ 表头三态排序（降序 → 升序 → 取消），排序本身仍交给父组件
 *   ✅ 超过阈值窗口化渲染，只挂可视区附近的行
 *   ✅ 封板 / 炸板新行高亮、斑马纹、空态、刷新遮罩
 *   ❌ 不做固定列 / 多级表头 / 展开行 / 列拖拽 —— 这张表用不到
 *
 * 为什么通达信页要换掉 el-table：
 *   面板里的内核通常比桌面浏览器老，el-table 为了固定列 / 树形 / 展开行保留了
 *   大量 DOM 和布局计算，150+ 行时滚动明显发涩。原生表 + 窗口化后，DOM 里
 *   始终只有几十行，滚动和刷新都更稳。
 */

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  formatMarketCap,
  formatMoneyFromYuan,
  formatNumber,
  formatPercent,
} from '@/utils/ztliveFormat'
import ZtliveColumnConfig from './ZtliveColumnConfig.vue'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  /** 通达信窄栏用紧凑列集 */
  compact: { type: Boolean, default: false },
  height: { type: String, default: 'calc(100vh - 430px)' },
  minHeight: { type: String, default: '360' },
})

const emit = defineEmits(['sort-change'])

const VIRTUAL_THRESHOLD = 80
const OVERSCAN = 8

/* ══════════ 列定义 ══════════ */

const NAME_COLUMN = {
  key: 'name',
  label: '股票',
  width: 63,
  align: 'center',
  tooltip: true,
  cellClass: 'cell-name',
}

/** 名称列固定第一列，不参与显示 / 排序配置（与旧版一致） */
const BASE_COLUMNS = [
  { key: 'code', label: '代码', width: 78 },
  { key: 'status', label: '状态', width: 70, sortable: true },
  { key: 'boardNumber', label: '连板', width: 88, sortable: true },
  { key: 'pct', label: '涨幅', width: 78, sortable: true },
  { key: 'sealAmount', label: '封单', width: 86, sortable: true },
  { key: 'firstTime', label: '首封', width: 86, sortable: true },
  { key: 'plate', label: '板块', minWidth: 105, tooltip: true },
]

const EXTRA_COLUMNS = [
  { key: 'price', label: '价格', width: 76, sortable: true },
  { key: 'auctionPct', label: '竞价涨幅', width: 100, sortable: true },
  { key: 'amount', label: '成交额', width: 88, sortable: true },
  { key: 'endTime', label: '终封', width: 86, sortable: true },
  { key: 'turnoverRate', label: '换手', width: 76, sortable: true },
  { key: 'floatMarketCap', label: '流通市值', width: 100, sortable: true },
]

const configurableColumns = computed(() => {
  const topic = { key: 'topic', label: '题材', minWidth: 150, tooltip: true }
  return props.compact
    ? [...BASE_COLUMNS, topic]
    : [...BASE_COLUMNS, ...EXTRA_COLUMNS, topic]
})

/* ══════════ 列配置（顺序 + 显隐） ══════════ */

const COLUMN_STORAGE_KEYS = {
  full: 'duanxian:ztlive:columns:v1',
  compact: 'duanxian:ztlive:columns:embed:v1',
}

// 站点页列多、独立页是紧凑列集，分开存：否则在面板里隐藏一列会把站点页也一起改掉
const storageKey = computed(() => (
  props.compact ? COLUMN_STORAGE_KEYS.compact : COLUMN_STORAGE_KEYS.full
))

function defaultColumnState() {
  return configurableColumns.value.map((column) => ({ key: column.key, visible: true }))
}

function readColumnState() {
  let stored
  try {
    stored = JSON.parse(localStorage.getItem(storageKey.value) || '[]')
  } catch (_) {
    stored = []
  }

  const available = new Map(configurableColumns.value.map((column) => [column.key, column]))
  const seen = new Set()
  const next = []

  if (Array.isArray(stored)) {
    for (const item of stored) {
      if (!item || !available.has(item.key) || seen.has(item.key)) continue
      next.push({ key: item.key, visible: item.visible !== false })
      seen.add(item.key)
    }
  }

  // 新版本新增的列默认显示，追加在末尾，不打断用户已经排好的顺序
  for (const column of configurableColumns.value) {
    if (!seen.has(column.key)) next.push({ key: column.key, visible: true })
  }

  if (next.length && !next.some((item) => item.visible)) next[0].visible = true
  return next
}

const columnState = ref(readColumnState())

const visibleColumns = computed(() => {
  const available = new Map(configurableColumns.value.map((column) => [column.key, column]))
  const configured = columnState.value
    .filter((item) => item.visible && available.has(item.key))
    .map((item) => available.get(item.key))

  return [NAME_COLUMN, ...configured]
})

function persistColumnState() {
  try {
    localStorage.setItem(storageKey.value, JSON.stringify(columnState.value))
  } catch (_) {
    /* 隐私模式 / 配额满：仅本次会话生效 */
  }
}

function onColumnChange(next) {
  const visibleKeys = new Set(
    next.filter((item) => item.visible).map((item) => item.key),
  )

  // 排序列被隐藏后，表头已经看不到箭头了，继续按它排序会让用户莫名其妙
  if (sortState.value.key && !visibleKeys.has(sortState.value.key)) {
    sortState.value = { key: '', order: '' }
    emit('sort-change', { prop: null, order: null })
  }

  columnState.value = next
  persistColumnState()
  nextTick(() => {
    measured = false
    measureContainer()
    scheduleWindowUpdate()
  })
}

function onColumnReset() {
  columnState.value = defaultColumnState()
  try {
    localStorage.removeItem(storageKey.value)
  } catch (_) {
    /* ignore */
  }
  nextTick(() => {
    measured = false
    measureContainer()
    scheduleWindowUpdate()
  })
}

/* ══════════ 单元格 ══════════ */

function cellText(row, key) {
  switch (key) {
    case 'pct':
      return formatPercent(row.pct)
    case 'auctionPct':
      return formatPercent(row.auctionPct)
    case 'price':
      return formatNumber(row.price)
    case 'sealAmount':
      return row.sealAmountText || '--'
    case 'amount':
      return row.amountText || formatMoneyFromYuan(row.amount)
    case 'turnoverRate':
      return formatPercent(row.turnoverRate)
    case 'floatMarketCap':
      return formatMarketCap(row.floatMarketCap)
    case 'boardNumber':
      return row.board || '--'
    default:
      return row[key] ?? '--'
  }
}

function cellClass(row, column) {
  switch (column.key) {
    case 'status':
      return row.status === '涨停' ? 'cell-rise' : 'cell-fall'
    case 'boardNumber':
      return 'cell-board'
    case 'pct':
      return 'cell-rise'
    case 'auctionPct':
      return Number(row.auctionPct) >= 0 ? 'cell-rise' : 'cell-fall'
    case 'sealAmount':
      return row.status === '涨停' ? 'cell-rise' : 'cell-muted'
    default:
      return column.cellClass || ''
  }
}

function rowClass(row, index) {
  const classes = ['nz-row']
  if ((virtualStart.value + index) % 2 === 1) classes.push('is-striped')
  if (row.__fresh) {
    classes.push(row.status === '涨停' ? 'row-fresh-rise' : 'row-fresh-fall')
  }
  return classes
}

const rowKey = (row) => row.id || row.code

/* ══════════ 列宽 ══════════ */

const scrollRef = ref(null)
const containerWidth = ref(0)
let resizeObserver = null

const columnBaseWidth = (column) => Number(column.width) || Number(column.minWidth) || 60

/**
 * 与 el-table 的 `updateColumnsWidth()` 同口径：
 * 写了 width 的列原样固定；只给 minWidth 的列先拿最小值，
 * 剩余空间按 minWidth 比例分配，取整余量补到第一个弹性列。
 * 剩余为负时保持 minWidth，让表格变宽并出现横向滚动。
 */
const colWidths = computed(() => {
  const list = visibleColumns.value
  const out = new Array(list.length)
  const fixed = []
  const flex = []
  const available = containerWidth.value

  list.forEach((column, index) => {
    if (Number(column.width) > 0) fixed.push({ index, width: Number(column.width) })
    else flex.push({ index, min: columnBaseWidth(column) })
  })

  /** 列宽总和小于容器时，把差额补给最后一列，避免表格右侧留白（名称列不拉伸） */
  const stretch = () => {
    if (!available || out.length <= 1) return out
    const total = out.reduce((sum, width) => sum + (width || 0), 0)
    if (total > 0 && total < available) out[out.length - 1] += available - total
    return out
  }

  fixed.forEach((item) => { out[item.index] = item.width })
  if (!flex.length) return stretch()

  if (!available) {
    flex.forEach((item) => { out[item.index] = item.min })
    return out
  }

  const fixedTotal = fixed.reduce((sum, item) => sum + item.width, 0)
  const flexAvailable = available - fixedTotal
  const minTotal = flex.reduce((sum, item) => sum + item.min, 0)

  if (flex.length === 1) {
    out[flex[0].index] = Math.max(flex[0].min, flexAvailable)
    return stretch()
  }

  if (flexAvailable <= minTotal) {
    flex.forEach((item) => { out[item.index] = item.min })
    return stretch()
  }

  const extra = flexAvailable - minTotal
  const perPixel = extra / minTotal
  let distributed = 0

  flex.forEach((item, index) => {
    if (index === 0) return
    const add = Math.floor(item.min * perPixel)
    distributed += add
    out[item.index] = item.min + add
  })
  out[flex[0].index] = flex[0].min + extra - distributed

  return stretch()
})

const totalWidth = computed(() => colWidths.value.reduce((sum, width) => sum + (width || 0), 0))
const tableStyle = computed(() => ({ width: `${totalWidth.value}px` }))

/* ══════════ 窗口化渲染 ══════════ */

const virtualStart = ref(0)
const virtualEnd = ref(0)
const rowHeight = ref(34)
let measured = false
let rafId = 0

const virtualized = computed(() => props.rows.length > VIRTUAL_THRESHOLD)

const visibleRows = computed(() => (
  virtualized.value ? props.rows.slice(virtualStart.value, virtualEnd.value) : props.rows
))

const padTop = computed(() => (virtualized.value ? virtualStart.value * rowHeight.value : 0))
const padBottom = computed(() => (
  virtualized.value
    ? Math.max(0, (props.rows.length - virtualEnd.value) * rowHeight.value)
    : 0
))

function updateWindow() {
  const el = scrollRef.value
  if (!el) return

  if (!virtualized.value) {
    virtualStart.value = 0
    virtualEnd.value = props.rows.length
    return
  }

  if (!measured) {
    const firstRow = el.querySelector('tbody tr.nz-row')
    if (firstRow && firstRow.offsetHeight >= 12) {
      rowHeight.value = firstRow.offsetHeight
      measured = true
    }
  }

  const height = rowHeight.value || 34
  // 表头 sticky 在滚动容器里但仍占布局高度，计算可视窗口时要先减掉
  const headerHeight = el.querySelector('thead')?.offsetHeight || 0
  const bodyScrollTop = Math.max(0, el.scrollTop - headerHeight)
  const viewport = Math.max(0, el.clientHeight - headerHeight)
  const visibleCount = Math.ceil(viewport / height) + 1

  virtualStart.value = Math.max(0, Math.floor(bodyScrollTop / height) - OVERSCAN)
  virtualEnd.value = Math.min(
    props.rows.length,
    virtualStart.value + visibleCount + OVERSCAN * 2,
  )
}

function scheduleWindowUpdate() {
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    updateWindow()
  })
}

function measureContainer() {
  const width = scrollRef.value?.clientWidth || 0
  if (width && Math.abs(width - containerWidth.value) > 0.5) {
    containerWidth.value = width
  }
}

watch(
  () => props.rows.length,
  () => nextTick(() => {
    measured = false
    scheduleWindowUpdate()
  }),
)

watch(
  () => props.compact,
  () => nextTick(() => {
    columnState.value = readColumnState()
    measured = false
    measureContainer()
    scheduleWindowUpdate()
  }),
)

/* ══════════ 排序 ══════════ */

const sortState = ref({ key: '', order: '' })

/** 与 el-table 的 sortable="custom" 三态一致：降序 → 升序 → 取消 */
function onHeaderClick(column) {
  if (!column.sortable) return

  let next
  if (sortState.value.key !== column.key) {
    next = { key: column.key, order: 'descending' }
  } else if (sortState.value.order === 'descending') {
    next = { key: column.key, order: 'ascending' }
  } else if (sortState.value.order === 'ascending') {
    next = { key: '', order: '' }
  } else {
    next = { key: column.key, order: 'descending' }
  }

  sortState.value = next
  emit('sort-change', {
    prop: next.key || null,
    order: next.order || null,
  })
}

function headerClass(column) {
  const classes = []
  if (column.key === 'name') classes.push('is-name-head')
  if (column.sortable) classes.push('is-sortable')
  if (sortState.value.key === column.key) {
    classes.push(sortState.value.order === 'descending' ? 'is-sorted-desc' : 'is-sorted-asc')
  }
  return classes
}

/* ══════════ 生命周期 ══════════ */

onMounted(() => {
  measureContainer()

  if (typeof ResizeObserver !== 'undefined' && scrollRef.value) {
    resizeObserver = new ResizeObserver(() => {
      measureContainer()
      scheduleWindowUpdate()
    })
    resizeObserver.observe(scrollRef.value)
  }

  nextTick(() => {
    measureContainer()
    updateWindow()
  })
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div
    class="nz-table"
    :style="{
      height,
      minHeight: /^\d+$/.test(minHeight) ? `${minHeight}px` : minHeight,
    }"
  >
    <div ref="scrollRef" class="nz-scroll" @scroll.passive="scheduleWindowUpdate">
      <table class="nz-grid" :style="tableStyle">
        <colgroup>
          <col v-for="(width, index) in colWidths" :key="index" :style="{ width: `${width}px` }">
        </colgroup>

        <thead>
          <tr>
            <th
              v-for="column in visibleColumns"
              :key="column.key"
              :class="headerClass(column)"
              :style="{ textAlign: column.align || 'left' }"
              :aria-sort="
                sortState.key === column.key
                  ? (sortState.order === 'ascending' ? 'ascending' : 'descending')
                  : undefined
              "
              @click="onHeaderClick(column)"
            >
              <span class="cell" :class="{ 'nz-name-head': column.key === 'name' }">
                <template v-if="column.key === 'name'">
                  <ZtliveColumnConfig
                    :columns="configurableColumns"
                    :model-value="columnState"
                    @update:model-value="onColumnChange"
                    @reset="onColumnReset"
                  />
                  <span class="nz-name-label">{{ column.label }}</span>
                </template>
                <template v-else>{{ column.label }}</template>
              </span>
            </th>
          </tr>
        </thead>

        <tbody>
          <!-- 窗口化占位：撑起上方被裁掉的行高 -->
          <tr v-if="padTop" class="nz-spacer" aria-hidden="true">
            <td :colspan="visibleColumns.length" :style="{ height: `${padTop}px` }" />
          </tr>

          <tr
            v-for="(row, index) in visibleRows"
            :key="rowKey(row)"
            :class="rowClass(row, index)"
          >
            <td
              v-for="column in visibleColumns"
              :key="column.key"
              :class="cellClass(row, column)"
              :style="{ textAlign: column.align || 'left' }"
              :title="column.tooltip ? String(row[column.key] ?? '') : undefined"
            >
              <span class="cell">{{ cellText(row, column.key) }}</span>
            </td>
          </tr>

          <tr v-if="!visibleRows.length" class="nz-empty-row">
            <td :colspan="visibleColumns.length" class="nz-empty">暂无数据</td>
          </tr>

          <tr v-if="padBottom" class="nz-spacer" aria-hidden="true">
            <td :colspan="visibleColumns.length" :style="{ height: `${padBottom}px` }" />
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="loading" class="nz-loading">
      <span class="nz-spinner" aria-hidden="true" />
      <span>数据更新中…</span>
    </div>
  </div>
</template>

<style scoped>
.nz-table {
  position: relative;
  overflow: hidden;
  /* 外框由使用方提供（站点页 .table-panel / 独立页 .embed-body），
     这里再画一圈会变成双层边框 */
  background: var(--color-bg-card);
}

.nz-scroll {
  height: 100%;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-light) transparent;
}

.nz-scroll::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.nz-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--color-border-light);
}

.nz-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.nz-grid {
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
}

/* ---------- 表头 ---------- */
.nz-grid thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  height: 32px;
  padding: 0 10px;
  border-bottom: 2px solid var(--color-border-light);
  background: var(--color-bg-deep);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
  user-select: none;
}

.nz-grid thead th.is-sortable {
  cursor: pointer;
}

.nz-grid thead th.is-sortable:hover {
  color: var(--color-text-primary);
}

.nz-grid thead th.is-sorted-desc .cell::after {
  content: '▼';
  margin-left: 4px;
  font-size: 9px;
  color: var(--color-rise);
}

.nz-grid thead th.is-sorted-asc .cell::after {
  content: '▲';
  margin-left: 4px;
  font-size: 9px;
  color: var(--color-rise);
}

/* ---------- 表体 ---------- */
.nz-grid tbody td {
  height: 36px;
  padding: 0 10px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-card);
  color: var(--color-text-primary);
  white-space: nowrap;
}

.nz-grid tbody tr.is-striped > td {
  background: var(--color-bg-card-hover);
}

.nz-grid tbody tr.nz-row:hover > td {
  background: var(--color-rise-soft);
}

/* 新封板 / 炸板高亮：必须压过 hover 与斑马纹，否则鼠标一放上去就“消失” */
.nz-grid tbody tr.row-fresh-rise > td {
  background: rgba(239, 68, 68, 0.18) !important;
}

.nz-grid tbody tr.row-fresh-fall > td {
  background: rgba(34, 197, 94, 0.18) !important;
}

.nz-grid tbody tr.nz-spacer > td,
.nz-grid tbody td.nz-spacer-cell {
  padding: 0;
  border: 0;
  background: transparent;
}

.nz-grid tbody td.nz-empty {
  height: 160px;
  text-align: center;
  color: var(--color-text-muted);
}

/* ---------- 单元格内容 ---------- */
.cell {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 名称表头：齿轮 + 「股票」放一行；63px 内要放得下，左右 padding 收到 4px */
.nz-grid thead th.is-name-head {
  padding: 0 4px;
}

.nz-name-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  overflow: visible;
}

.cell-name {
  font-weight: 700;
}

/* 名称列按旧版 63px 收窄后，左右 padding 也要跟着收，否则 4 字股票名会被截断 */
.nz-grid tbody td.cell-name {
  padding: 0 4px;
}

.cell-rise {
  color: var(--color-rise);
}

.cell-fall {
  color: var(--color-fall);
}

.cell-muted {
  color: var(--color-text-muted);
}

.cell-board .cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  padding: 2px 8px;
  border-radius: 999px;
  background: linear-gradient(135deg, #ef4444, #f97316);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.4;
}

/* ---------- 刷新遮罩 ---------- */
.nz-loading {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--color-bg-card);
  color: var(--color-text-secondary);
  font-size: 13px;
  opacity: 0.82;
  pointer-events: none;
}

.nz-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-border-light);
  border-top-color: var(--color-rise);
  border-radius: 50%;
  animation: nz-spin 0.7s linear infinite;
}

@keyframes nz-spin {
  to { transform: rotate(360deg); }
}
</style>
