<script setup>
import { computed } from 'vue'
import { formatClock } from '@/utils/ztliveFormat'
import { ZTLIVE_STALE_WARN_SECONDS, useZtliveFeed } from '@/composables/useZtliveFeed'
import { useZtVoice } from '@/composables/useZtVoice'
import VoiceSwitch from '@/components/ztlive/VoiceSwitch.vue'
import ZtliveTable from '@/components/ztlive/ZtliveTable.vue'

// 数据与语音两块能力都抽成组合式函数，站点页和通达信独立页共用同一份口径。
const voice = useZtVoice()
const feed = useZtliveFeed({
  // 每次快照都交给语音引擎做增量对比：首屏只播种，之后新出现的涨停 / 炸板才播报。
  onSnapshot: (list) => voice.handleSnapshot(list),
})

const {
  initialLoading,
  refreshing,
  errorText,
  payload,
  activePlate,
  hideUnselected,
  searchText,
  lastUpdatedAt,
  staleSeconds,
  summary,
  dataDate,
  isEmpty,
  filteredRows,
  visibleCountText,
  selectPlate,
  onSortChange,
  loadData,
} = feed

const formatUpdatedAt = (value = lastUpdatedAt.value) => formatClock(value)
const isStale = computed(() => staleSeconds.value > ZTLIVE_STALE_WARN_SECONDS)
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
          <span v-if="isStale" class="stale-hint">数据已 {{ staleSeconds }} 秒未更新，请检查后端与数据源</span>
        </div>
        <VoiceSwitch :rows="payload.list" />
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
        <span v-if="!initialLoading && !payload.plates.length" class="empty-inline">暂无板块统计</span>
      </div>
    </section>

    <section class="table-panel">
      <div class="table-toolbar">
        <div>
          <span class="section-title">个股明细</span>
          <span class="section-caption">{{ visibleCountText }} · 每 3 秒自动刷新</span>
        </div>
        <span class="source-label">数据源：第三方公开行情快照</span>
      </div>

      <el-alert v-if="errorText" :title="errorText" type="error" show-icon :closable="false" class="ztlive-alert" />
      <el-skeleton v-else-if="initialLoading" :rows="8" animated />
      <el-empty v-else-if="isEmpty" description="当前没有涨停播报数据" />
      <ZtliveTable v-else :rows="filteredRows" :loading="refreshing" @sort-change="onSortChange" />
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

.stale-hint { color: #fbbf24; }

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
