<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchLogs, adminErrorMessage } from '@/api/admin'
import { useAdminStore } from '@/stores/admin'
import { formatFullTime, fromNow } from '@/utils/adminFormat'

/**
 * 操作日志。
 *
 * 后台能重置任意用户密码、能改任意人到期时间 —— 没有这一页，
 * 出了纠纷就只能靠猜。所以它读起来必须是「谁、什么时候、对谁、做了什么、从哪个 IP」。
 *
 * 这个页面**只读**：后端没有提供任何修改或删除日志的接口，
 * 连管理员自己也不行。能被改的日志等于没有日志。
 */
const adminStore = useAdminStore()

const loading = ref(false)
const rows = ref([])
const total = ref(0)

const query = reactive({
  action: '',
  keyword: '',
  page: 1,
  pageSize: 30,
})

const actionOptions = computed(() => adminStore.meta?.actions || [])

async function load() {
  loading.value = true
  try {
    const data = await fetchLogs({ ...query })
    rows.value = data.items || []
    total.value = data.total || 0
  } catch (error) {
    ElMessage.error(adminErrorMessage(error, '日志加载失败'))
  } finally {
    loading.value = false
  }
}

function search() {
  query.page = 1
  load()
}

function resetFilters() {
  query.action = ''
  query.keyword = ''
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

/** 按动作给个颜色，扫一眼就能分出「登录」「放行」「重置密码」 */
function tagType(action) {
  if (action === 'admin_login') return 'info'
  if (action === 'admin_login_failed') return 'warning'
  if (action === 'account_password_reset' || action === 'account_status') return 'danger'
  if (action === 'order_approve' || action === 'coverage_grant') return 'success'
  return 'primary'
}

onMounted(async () => {
  await adminStore.loadMeta()
  await load()
})
</script>

<template>
  <div class="admin-logs">
    <section class="panel filter-bar">
      <el-select v-model="query.action" placeholder="全部动作" clearable style="width: 170px" @change="search">
        <el-option v-for="a in actionOptions" :key="a.key" :label="a.label" :value="a.key" />
      </el-select>

      <el-input
        v-model="query.keyword"
        placeholder="管理员 / 目标 / 备注"
        clearable
        style="width: 240px"
        @keyup.enter="search"
        @clear="search"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>

      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>

      <div class="filter-spacer" />
      <span class="total-hint">共 {{ total }} 条 · 只读不可删</span>
    </section>

    <section class="panel">
      <el-table v-loading="loading" :data="rows" size="small" style="width: 100%">
        <el-table-column label="时间" width="176">
          <template #default="{ row }">
            {{ formatFullTime(row.createdAt) }}
            <div class="muted small">{{ fromNow(row.createdAt) }}</div>
          </template>
        </el-table-column>

        <el-table-column prop="adminName" label="操作人" width="110" />

        <el-table-column label="动作" width="124">
          <template #default="{ row }">
            <el-tag :type="tagType(row.action)" size="small" effect="plain">
              {{ row.actionText }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="对象" width="170">
          <template #default="{ row }">
            <span v-if="row.targetType" class="target">
              {{ row.targetType }}:{{ row.targetId || '-' }}
            </span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>

        <el-table-column label="详情" min-width="240">
          <template #default="{ row }">
            <span class="detail-text">{{ row.detail || '-' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="IP" width="130">
          <template #default="{ row }">
            <span class="muted">{{ row.ip || '-' }}</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          :current-page="query.page"
          :page-size="query.pageSize"
          :page-sizes="[30, 50, 100]"
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
.admin-logs {
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

.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-spacer { flex: 1; }

.total-hint {
  font-size: 12px;
  color: var(--color-text-muted);
}

.target {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--color-text-primary);
}

.detail-text {
  font-size: 12px;
  color: var(--color-text-secondary);
  word-break: break-all;
}

.muted { color: var(--color-text-muted); }
.small { font-size: 11px; }

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
