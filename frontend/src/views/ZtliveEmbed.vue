<script setup>
import { computed } from 'vue'
import { formatClock } from '@/utils/ztliveFormat'
import { ZTLIVE_STALE_WARN_SECONDS, useZtliveFeed } from '@/composables/useZtliveFeed'
import { useZtVoice } from '@/composables/useZtVoice'
import VoiceSwitch from '@/components/ztlive/VoiceSwitch.vue'
import ZtliveTable from '@/components/ztlive/ZtliveTable.vue'

/**
 * 涨停播报独立页（通达信面板专用）
 *
 * 与站点页的区别只在「外壳」：没有侧边栏、没有大卡片，全部按窄栏 + 贴边布局，
 * 数据与语音完全复用 useZtliveFeed / useZtVoice，口径与站点页一致。
 */
const voice = useZtVoice()
const feed = useZtliveFeed({
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

const updatedAtText = computed(() => formatClock(lastUpdatedAt.value))
const isStale = computed(() => staleSeconds.value > ZTLIVE_STALE_WARN_SECONDS)
</script>

<template>
  <div class="embed-page">
    <header class="embed-header">
      <div class="embed-title">
        <span class="embed-title-main">涨停播报</span>
        <span class="embed-title-sub">{{ dataDate }} · 更新 {{ updatedAtText }}</span>
        <span v-if="isStale" class="embed-stale">数据已 {{ staleSeconds }} 秒未更新</span>
      </div>
      <div class="embed-actions">
        <VoiceSwitch :rows="payload.list" />
        <button type="button" class="embed-refresh" :disabled="refreshing" @click="loadData({ manual: true })">
          {{ refreshing ? '刷新中' : '刷新' }}
        </button>
      </div>
    </header>

    <div class="embed-stats">
      <span class="stat stat-total">涨停 <b>{{ summary.sealed }}</b></span>
      <span class="stat stat-blown">炸板 <b>{{ summary.blown }}</b></span>
      <span class="stat stat-rate">封板率 <b>{{ summary.sealRate }}%</b></span>
      <span class="stat stat-height">最高 <b>{{ summary.maxBoard || '--' }}</b><i v-if="summary.maxBoard">板</i></span>
      <span class="stat stat-count">共 <b>{{ summary.total }}</b> 条</span>
    </div>

    <div class="embed-filters">
      <div class="plate-list">
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
      <div class="filter-tools">
        <el-input v-model="searchText" size="small" clearable placeholder="搜索股票 / 代码 / 题材" class="stock-search">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-checkbox v-model="hideUnselected" :disabled="!activePlate">只看选中板块</el-checkbox>
        <span class="count-text">{{ visibleCountText }}</span>
      </div>
    </div>

    <div class="embed-body">
      <el-alert v-if="errorText" :title="errorText" type="error" show-icon :closable="false" class="embed-alert" />
      <el-skeleton v-else-if="initialLoading" :rows="8" animated />
      <el-empty v-else-if="isEmpty" description="当前没有涨停播报数据（非交易时段或数据源待开盘）" />
      <ZtliveTable
        v-else
        compact
        :rows="filteredRows"
        :loading="refreshing"
        height="calc(100vh - 168px)"
        min-height="220"
        @sort-change="onSortChange"
      />
    </div>
  </div>
</template>

<style scoped>
.embed-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 10px 12px 12px;
  gap: 8px;
  overflow: hidden;
  background: var(--color-bg-base);
}

.embed-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.embed-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.embed-title-main {
  color: var(--color-text-primary);
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.embed-title-sub {
  color: var(--color-text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.embed-stale {
  padding: 2px 6px;
  border: 1px solid rgba(251, 191, 36, 0.45);
  border-radius: 4px;
  background: rgba(251, 191, 36, 0.1);
  color: #fbbf24;
  font-size: 11px;
  white-space: nowrap;
}

.embed-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.embed-refresh {
  border: 1px solid var(--color-border);
  border-radius: 5px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.16s ease;
}

.embed-refresh:hover:not(:disabled) {
  border-color: var(--color-border-light);
  color: var(--color-text-primary);
}

.embed-refresh:disabled { opacity: 0.6; cursor: default; }

.embed-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.stat {
  padding: 4px 9px;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  background: rgba(20, 30, 48, 0.9);
  color: var(--color-text-secondary);
  font-size: 12px;
}

.stat b {
  margin-left: 4px;
  color: var(--color-text-primary);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.stat i { font-style: normal; font-size: 11px; }
.stat-blown b { color: #4ade80; }
.stat-total b { color: #f97316; }
.stat-height b { color: #38bdf8; }
.stat-rate b { color: #facc15; }

.embed-filters {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.plate-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1 1 380px;
  max-height: 66px;
  overflow-y: auto;
}

.plate-chip {
  border: 1px solid rgba(90, 110, 136, 0.55);
  border-radius: 5px;
  padding: 3px 8px;
  background: rgba(90, 110, 136, 0.1);
  color: var(--color-text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  transition: all 0.16s ease;
}

.plate-chip b { margin-left: 4px; color: #f87171; font-size: 11px; }
.plate-chip i { margin-left: 3px; color: #4ade80; font-size: 11px; font-style: normal; }
.plate-chip:hover,
.plate-chip.active {
  border-color: rgba(248, 113, 113, 0.65);
  background: rgba(239, 68, 68, 0.13);
  color: #fca5a5;
}

.plate-chip-all b { color: #f97316; }

.filter-tools {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stock-search { width: 180px; }

.count-text {
  color: var(--color-text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.embed-body {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-card);
  padding: 8px;
  display: flex;
  flex-direction: column;
}

.embed-alert { margin-bottom: 8px; }

.embed-body :deep(.el-table) { flex: 1; }

.empty-inline { color: var(--color-text-muted); font-size: 12px; }

@media (max-width: 720px) {
  .embed-page { padding: 8px; gap: 6px; }
  .embed-title-main { font-size: 15px; }
  .filter-tools { width: 100%; justify-content: space-between; flex-wrap: wrap; }
  .stock-search { width: 100%; }
  .embed-filters { flex-direction: column; }
  .plate-list { max-height: 60px; }
}
</style>

