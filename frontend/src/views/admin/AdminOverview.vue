<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as echarts from 'echarts'
import { fetchOverview, approveOrder, rejectOrder, adminErrorMessage } from '@/api/admin'
import { useThemeStore } from '@/stores/theme'
import { formatMoney, formatTail, formatTime, fromNow } from '@/utils/adminFormat'

/**
 * 运营概览。
 *
 * 这一页只回答三个问题：
 *   1. 生意在往哪走？（注册 / 付费 / 收入的趋势）
 *   2. 现在有没有等着我做的事？（待核对订单、系统告警）
 *   3. 人从哪来？（渠道分布）
 *
 * 待核对的订单直接在这一页就能放行 —— 运营的日常动作是「对完账单点一下」，
 * 不该逼他先跳到订单页再筛选一遍。
 */
const router = useRouter()
const themeStore = useThemeStore()
const refreshPendingCount = inject('refreshPendingCount', () => {})

const loading = ref(true)
const data = ref(null)
const days = ref(14)
const processing = ref('')

const trendRef = ref(null)
const channelRef = ref(null)
let trendChart = null
let channelChart = null

const accounts = computed(() => data.value?.accounts || {})
const orders = computed(() => data.value?.orders || {})
const codes = computed(() => data.value?.codes || {})
const warnings = computed(() => data.value?.warnings || [])
const pendingOrders = computed(() => data.value?.pendingOrders || [])
const recentAccounts = computed(() => data.value?.recentAccounts || [])

async function load() {
  loading.value = true
  try {
    data.value = await fetchOverview({ days: days.value })
    await nextTick()
    renderCharts()
  } catch (error) {
    ElMessage.error(adminErrorMessage(error, '概览数据加载失败'))
  } finally {
    loading.value = false
  }
}

// ---------------------------------------------------------------- 图表

const CHART_COLORS = {
  rise: '#ef4444',
  accent: '#f97316',
  blue: '#3b82f6',
  green: '#22c55e',
}

function axisColors() {
  return themeStore.isDark
    ? { axis: '#5a6e88', split: 'rgba(90,110,136,0.16)', text: '#8fa0b8' }
    : { axis: '#94a3b8', split: 'rgba(148,163,184,0.18)', text: '#5b6b82' }
}

function renderTrend() {
  if (!trendRef.value || !data.value) return
  const { axis, split, text } = axisColors()
  const rows = data.value.trend

  trendChart?.dispose()
  trendChart = echarts.init(trendRef.value, themeStore.isDark ? 'dark' : undefined)
  trendChart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: themeStore.isDark ? '#1a2740' : '#fff',
      borderColor: themeStore.isDark ? '#253d5f' : '#e2e8f0',
      textStyle: { color: themeStore.isDark ? '#e8edf5' : '#1a2233', fontSize: 12 },
    },
    legend: {
      data: ['新增注册', '付费订单', '收入'],
      right: 0,
      top: 0,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: text, fontSize: 11 },
    },
    grid: { top: 38, left: 8, right: 8, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category',
      data: rows.map((r) => r.date.slice(5)),
      axisLine: { lineStyle: { color: axis } },
      axisLabel: { color: text, fontSize: 10.5 },
      axisTick: { show: false },
    },
    yAxis: [
      {
        type: 'value',
        name: '人数 / 单数',
        nameTextStyle: { color: text, fontSize: 10 },
        splitLine: { lineStyle: { color: split } },
        axisLabel: { color: text, fontSize: 10.5 },
      },
      {
        type: 'value',
        name: '收入 ¥',
        nameTextStyle: { color: text, fontSize: 10 },
        splitLine: { show: false },
        axisLabel: { color: text, fontSize: 10.5 },
      },
    ],
    series: [
      {
        name: '新增注册',
        type: 'line',
        smooth: true,
        symbolSize: 6,
        data: rows.map((r) => r.registers),
        itemStyle: { color: CHART_COLORS.rise },
        lineStyle: { width: 2.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(239,68,68,0.28)' },
            { offset: 1, color: 'rgba(239,68,68,0)' },
          ]),
        },
      },
      {
        name: '付费订单',
        type: 'bar',
        barWidth: 12,
        data: rows.map((r) => r.paidOrders),
        itemStyle: { color: CHART_COLORS.accent, borderRadius: [3, 3, 0, 0] },
      },
      {
        name: '收入',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 5,
        data: rows.map((r) => r.revenue),
        itemStyle: { color: CHART_COLORS.green },
        lineStyle: { width: 2, type: 'dashed' },
      },
    ],
  })
}

function renderChannel() {
  if (!channelRef.value || !data.value) return
  const { axis, split, text } = axisColors()
  const rows = [...data.value.channelAccounts].reverse()

  channelChart?.dispose()
  channelChart = echarts.init(channelRef.value, themeStore.isDark ? 'dark' : undefined)
  channelChart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: themeStore.isDark ? '#1a2740' : '#fff',
      borderColor: themeStore.isDark ? '#253d5f' : '#e2e8f0',
      textStyle: { color: themeStore.isDark ? '#e8edf5' : '#1a2233', fontSize: 12 },
    },
    grid: { top: 8, left: 8, right: 34, bottom: 4, containLabel: true },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: rows.map((r) => r.channel),
      axisLine: { lineStyle: { color: axis } },
      axisTick: { show: false },
      axisLabel: { color: text, fontSize: 11 },
    },
    series: [
      {
        name: '注册数',
        type: 'bar',
        barWidth: 14,
        data: rows.map((r) => ({
          value: r.accounts,
          itemStyle: {
            borderRadius: [0, 4, 4, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: CHART_COLORS.rise },
              { offset: 1, color: CHART_COLORS.accent },
            ]),
          },
        })),
        label: { show: true, position: 'right', color: text, fontSize: 10.5 },
      },
    ],
  })
}

function renderCharts() {
  renderTrend()
  renderChannel()
}

function handleResize() {
  trendChart?.resize()
  channelChart?.resize()
}

watch(() => themeStore.isDark, () => {
  nextTick(renderCharts)
})

watch(days, () => {
  load()
})

// ---------------------------------------------------------------- 待核对订单

async function approve(row) {
  try {
    await ElMessageBox.confirm(
      `订单 ${row.orderNo}｜${row.phone || '无手机号'}｜${row.planName}｜${formatMoney(row.amount)}\n`
        + '请先在收款账单里核对到账金额与尾数，确认无误后再开通。',
      '确认已收到款项？',
      { confirmButtonText: '确认收款并开通', cancelButtonText: '再核对一下', type: 'warning' },
    )
  } catch (_) {
    return
  }

  processing.value = row.orderNo
  try {
    const result = await approveOrder(row.orderNo, {})
    ElMessage.success(`已开通，剩余 ${result.account?.daysLeft ?? '-'} 天`)
    await load()
    refreshPendingCount()
  } catch (error) {
    ElMessage.error(adminErrorMessage(error, '核销失败'))
  } finally {
    processing.value = ''
  }
}

async function reject(row) {
  let reason
  try {
    const result = await ElMessageBox.prompt('填写拒绝原因（会记录在订单备注里）', '拒绝该订单', {
      confirmButtonText: '确认拒绝',
      cancelButtonText: '取消',
      inputValue: '未收到该笔款项',
      inputPlaceholder: '例如：未收到该笔款项 / 金额与订单不符',
    })
    reason = result.value
  } catch (_) {
    return
  }

  processing.value = row.orderNo
  try {
    await rejectOrder(row.orderNo, { reason })
    ElMessage.success('已拒绝')
    await load()
    refreshPendingCount()
  } catch (error) {
    ElMessage.error(adminErrorMessage(error, '操作失败'))
  } finally {
    processing.value = ''
  }
}

function go(path) {
  router.push(path)
}

onMounted(async () => {
  await load()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
  channelChart?.dispose()
})
</script>

<template>
  <div v-loading="loading" class="admin-overview">
    <!-- 需要立刻知道的事 -->
    <div v-if="warnings.length" class="warning-stack">
      <div
        v-for="(item, index) in warnings"
        :key="index"
        class="warning-item"
        :class="`is-${item.level}`"
        @click="item.to && go(item.to)"
      >
        <el-icon :size="15">
          <WarningFilled v-if="item.level !== 'info'" />
          <InfoFilled v-else />
        </el-icon>
        <span class="warning-text">{{ item.text }}</span>
        <span v-if="item.to" class="warning-go">去处理 →</span>
      </div>
    </div>

    <!-- 核心指标 -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">注册用户</div>
        <div class="stat-value">{{ accounts.total || 0 }}</div>
        <div class="stat-sub">近 {{ data?.periodDays || days }} 天新增 {{ accounts.recent || 0 }}</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">当前有效会员</div>
        <div class="stat-value accent">{{ accounts.members || 0 }}</div>
        <div class="stat-sub">
          转化率 {{ accounts.conversionRate || 0 }}% ｜ 已过期 {{ accounts.expired || 0 }}
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-label">累计收入</div>
        <div class="stat-value">{{ formatMoney(orders.revenue) }}</div>
        <div class="stat-sub">
          共 {{ orders.paid || 0 }} 单 ｜ 客单 {{ formatMoney(orders.avgAmount) }}
        </div>
      </div>

      <div class="stat-card clickable" @click="go('/admin/orders')">
        <div class="stat-label">待核对订单</div>
        <div class="stat-value" :class="{ alert: (orders.confirming || 0) > 0 }">
          {{ orders.confirming || 0 }}
        </div>
        <div class="stat-sub">等待付款 {{ orders.pending || 0 }} ｜ 点此处理</div>
      </div>

      <div class="stat-card clickable" @click="go('/admin/codes')">
        <div class="stat-label">可用激活码</div>
        <div class="stat-value">{{ codes.unused || 0 }}</div>
        <div class="stat-sub">已用 {{ codes.used || 0 }} ｜ 作废 {{ codes.void || 0 }}</div>
      </div>
    </div>

    <!-- 图表 -->
    <div class="chart-grid">
      <section class="panel">
        <header class="panel-head">
          <h3>注册与付费趋势</h3>
          <el-radio-group v-model="days" size="small">
            <el-radio-button :value="7">7 天</el-radio-button>
            <el-radio-button :value="14">14 天</el-radio-button>
            <el-radio-button :value="30">30 天</el-radio-button>
          </el-radio-group>
        </header>
        <div ref="trendRef" class="chart-box" />
      </section>

      <section class="panel">
        <header class="panel-head">
          <h3>渠道来源（注册数）</h3>
          <span class="panel-hint">首次归因，只记第一次带来的渠道</span>
        </header>
        <div v-if="data?.channelAccounts?.length" ref="channelRef" class="chart-box" />
        <el-empty v-else description="还没有注册用户" :image-size="70" />
      </section>
    </div>

    <!-- 待核对队列 -->
    <section class="panel">
      <header class="panel-head">
        <h3>待处理订单</h3>
        <span class="panel-hint">核对到账后再点开通，金额尾数用于对账</span>
      </header>

      <el-table v-if="pendingOrders.length" :data="pendingOrders" size="small" style="width: 100%">
        <el-table-column prop="orderNo" label="订单号" width="170" />
        <el-table-column label="用户" min-width="130">
          <template #default="{ row }">{{ row.phone || '未登录下单' }}</template>
        </el-table-column>
        <el-table-column prop="planName" label="套餐" width="100" />
        <el-table-column label="金额" width="120">
          <template #default="{ row }">
            <span class="amount">{{ formatMoney(row.amount) }}</span>
            <span class="tail">尾数{{ formatTail(row.amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'confirming' ? 'warning' : 'info'" size="small" effect="plain">
              {{ row.status === 'confirming' ? '待核对' : '未付款' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="付款备注" min-width="150">
          <template #default="{ row }">
            <span class="muted">{{ row.payerNote || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="下单时间" width="150">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              link
              size="small"
              :loading="processing === row.orderNo"
              @click="approve(row)"
            >核销开通</el-button>
            <el-button
              type="danger"
              link
              size="small"
              :disabled="processing === row.orderNo"
              @click="reject(row)"
            >拒绝</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else description="没有待处理的订单，很干净" :image-size="70" />
    </section>

    <!-- 最近注册 -->
    <section class="panel">
      <header class="panel-head">
        <h3>最近注册</h3>
        <el-button link type="primary" size="small" @click="go('/admin/users')">
          查看全部用户 →
        </el-button>
      </header>

      <el-table v-if="recentAccounts.length" :data="recentAccounts" size="small" style="width: 100%">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column label="渠道" width="110">
          <template #default="{ row }">{{ row.channel || '直接访问' }}</template>
        </el-table-column>
        <el-table-column label="会员" width="150">
          <template #default="{ row }">
            <el-tag v-if="row.isMember" type="success" size="small" effect="plain">
              {{ row.planName }} {{ row.daysLeft }}天
            </el-tag>
            <el-tag v-else-if="row.expired" type="info" size="small" effect="plain">已过期</el-tag>
            <el-tag v-else type="warning" size="small" effect="plain">未开通</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" min-width="140">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
            <span class="muted">（{{ fromNow(row.createdAt) }}）</span>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else description="还没有注册用户" :image-size="70" />
    </section>
  </div>
</template>

<style scoped>
.admin-overview {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1500px;
}

.warning-stack { display: flex; flex-direction: column; gap: 8px; }

.warning-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  font-size: 12.5px;
  border: 1px solid transparent;
}

.warning-item.is-warn {
  background: rgba(249, 115, 22, 0.1);
  border-color: rgba(249, 115, 22, 0.3);
  color: var(--color-accent);
}

.warning-item.is-error {
  background: var(--color-rise-soft);
  border-color: rgba(220, 38, 38, 0.3);
  color: var(--color-rise);
}

.warning-item.is-info {
  background: var(--color-bg-card);
  border-color: var(--color-border);
  color: var(--color-text-secondary);
}

.warning-text { flex: 1; }
.warning-go { font-weight: 600; }
.warning-item.is-warn, .warning-item.is-info { cursor: pointer; }

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 14px;
}

.stat-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 16px 18px;
  box-shadow: var(--shadow-card);
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

.stat-card.clickable { cursor: pointer; }
.stat-card.clickable:hover { transform: translateY(-2px); box-shadow: var(--shadow-card-hover); }

.stat-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-weight: 500;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}

.stat-value.accent { color: var(--color-rise); }
.stat-value.alert { color: var(--color-accent); }

.stat-sub {
  margin-top: 7px;
  font-size: 11.5px;
  color: var(--color-text-muted);
}

.chart-grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 16px;
}

@media (max-width: 1100px) {
  .chart-grid { grid-template-columns: 1fr; }
}

.panel {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 16px 18px;
  box-shadow: var(--shadow-card);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 12px;
}

.panel-head h3 {
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-text-primary);
  letter-spacing: 0.02em;
}

.panel-hint {
  font-size: 11.5px;
  color: var(--color-text-muted);
}

.chart-box { height: 240px; width: 100%; }

.amount {
  font-weight: 600;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.tail {
  margin-left: 6px;
  font-size: 11px;
  color: var(--color-accent);
}

.muted { color: var(--color-text-muted); }
</style>
