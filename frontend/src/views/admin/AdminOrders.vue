<script setup>
import { inject, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { fetchOrders, approveOrder, rejectOrder, adminErrorMessage } from '@/api/admin'
import {
  formatMoney,
  formatTail,
  formatTime,
  fromNow,
  ORDER_STATUS_TEXT,
  ORDER_STATUS_TAG,
} from '@/utils/adminFormat'

/**
 * 订单管理。
 *
 * 这里处理的是「个人收款码」流程下最要命的一环：没有支付回调，
 * 用户点了「我已付款」之后，钱到底到没到，只能靠人去翻账单。
 *
 * 所以这一页的设计围绕「别点错」来做：
 *   - 待核对排在最前，默认就是它；
 *   - 金额旁边标出尾数，因为同一套餐多笔订单金额一样，尾数是唯一区分手段；
 *   - 核销要二次确认，且提示去核对账单；
 *   - 付款备注原样展示（支付宝填备注，微信没有）。
 */
const refreshPendingCount = inject('refreshPendingCount', () => {})

const loading = ref(false)
const rows = ref([])
const total = ref(0)
const counts = reactive({ confirming: 0, pending: 0 })

const query = reactive({
  status: 'confirming',
  keyword: '',
  page: 1,
  pageSize: 20,
})

const STATUS_TABS = [
  { value: 'confirming', label: '待核对' },
  { value: 'pending', label: '等待付款' },
  { value: 'paid', label: '已开通' },
  { value: 'rejected', label: '未通过' },
  { value: 'expired', label: '已过期' },
  { value: 'all', label: '全部' },
]

const processing = ref('')

async function load() {
  loading.value = true
  try {
    const data = await fetchOrders({ ...query })
    rows.value = data.items || []
    total.value = data.total || 0
    counts.confirming = Number(data.counts?.confirming || 0)
    counts.pending = Number(data.counts?.pending || 0)
  } catch (error) {
    ElMessage.error(adminErrorMessage(error, '订单加载失败'))
  } finally {
    loading.value = false
  }
}

function switchStatus(status) {
  query.status = status
  query.page = 1
  load()
}

function search() {
  query.page = 1
  load()
}

function handlePage(page) {
  query.page = page
  load()
}

function handleSize(size) {
  query.pageSize = size
  query.page = 1
  load()
}

async function approve(row) {
  try {
    await ElMessageBox.confirm(
      `订单 ${row.orderNo}\n`
        + `用户：${row.phone || '（未绑定账号）'}\n`
        + `套餐：${row.planName}\n`
        + `金额：${formatMoney(row.amount)}（尾数 ${formatTail(row.amount)}）\n\n`
        + '请先在微信/支付宝账单里确认这笔钱已到账，再点确认。',
      '确认已收到款项？',
      { confirmButtonText: '确认收款并开通', cancelButtonText: '再核对一下', type: 'warning' },
    )
  } catch (_) {
    return
  }

  processing.value = row.orderNo
  try {
    const result = await approveOrder(row.orderNo, {})
    ElMessage.success(
      result.account
        ? `已开通，该账号剩余 ${result.account.daysLeft} 天`
        : '已核销（该订单未绑定账号，权益未发放）',
    )
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
    const result = await ElMessageBox.prompt('填写拒绝原因，会记录在订单备注里', '拒绝该订单', {
      confirmButtonText: '确认拒绝',
      cancelButtonText: '取消',
      inputValue: '未收到该笔款项',
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

onMounted(load)
</script>

<template>
  <div class="admin-orders">
    <section class="panel">
      <div class="tab-row">
        <button
          v-for="tab in STATUS_TABS"
          :key="tab.value"
          type="button"
          class="tab-btn"
          :class="{ active: query.status === tab.value }"
          @click="switchStatus(tab.value)"
        >
          {{ tab.label }}
          <span v-if="tab.value === 'confirming' && counts.confirming" class="tab-badge">
            {{ counts.confirming }}
          </span>
          <span v-else-if="tab.value === 'pending' && counts.pending" class="tab-badge muted-badge">
            {{ counts.pending }}
          </span>
        </button>

        <div class="tab-spacer" />

        <el-input
          v-model="query.keyword"
          placeholder="订单号 / 手机号 / 付款备注"
          clearable
          style="width: 240px"
          @keyup.enter="search"
          @clear="search"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button type="primary" @click="search">查询</el-button>
      </div>
    </section>

    <section class="panel">
      <el-table v-loading="loading" :data="rows" size="small" style="width: 100%">
        <el-table-column prop="orderNo" label="订单号" width="154" />

        <el-table-column label="用户" width="126">
          <template #default="{ row }">
            <span :class="{ muted: !row.phone }">{{ row.phone || '未绑定' }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="planName" label="套餐" width="96" />

        <el-table-column label="金额 / 尾数" width="132">
          <template #default="{ row }">
            <span class="amount">{{ formatMoney(row.amount) }}</span>
            <span class="tail">{{ formatTail(row.amount) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="方式" width="72">
          <template #default="{ row }">
            {{ row.payMethod === 'alipay' ? '支付宝' : (row.payMethod === 'wx' ? '微信' : row.payMethod || '-') }}
          </template>
        </el-table-column>

        <el-table-column label="状态" width="92">
          <template #default="{ row }">
            <el-tag :type="ORDER_STATUS_TAG[row.status]" size="small" effect="plain">
              {{ ORDER_STATUS_TEXT[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="付款备注" min-width="150">
          <template #default="{ row }">
            <span :class="{ muted: !row.payerNote }">{{ row.payerNote || '-' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="下单时间" width="140">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
            <div class="muted small">{{ fromNow(row.createdAt) }}</div>
          </template>
        </el-table-column>

        <el-table-column label="处理" min-width="120">
          <template #default="{ row }">
            <span v-if="row.reviewedAt" class="muted">
              {{ formatTime(row.reviewedAt) }}
              <div class="small">{{ row.reviewedBy || '' }}</div>
            </span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending' || row.status === 'confirming'">
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
            <span v-else class="muted small">已处理</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          :current-page="query.page"
          :page-size="query.pageSize"
          :page-sizes="[20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next"
          background
          @current-change="handlePage"
          @size-change="handleSize"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-orders {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1600px;
}

.panel {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  box-shadow: var(--shadow-card);
}

.tab-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.tab-btn {
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 999px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all var(--transition-fast);
}

.tab-btn:hover { background: var(--color-bg-card-hover); color: var(--color-text-primary); }

.tab-btn.active {
  background: var(--color-rise-soft);
  color: var(--color-rise);
  font-weight: 600;
}

.tab-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--color-rise);
  color: #fff;
  font-size: 10.5px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.muted-badge { background: var(--color-text-muted); }

.tab-spacer { flex: 1; min-width: 20px; }

.amount {
  font-weight: 600;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.tail {
  margin-left: 5px;
  font-size: 11px;
  color: var(--color-accent);
  font-weight: 600;
}

.muted { color: var(--color-text-muted); }
.small { font-size: 11px; }

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
