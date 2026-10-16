<script setup>
import { computed, inject, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  fetchAccounts,
  fetchAccountDetail,
  grantMembership,
  resetAccountPassword,
  setAccountStatus,
  adminErrorMessage,
} from '@/api/admin'
import { useAdminStore } from '@/stores/admin'
import {
  formatMoney,
  formatTime,
  formatFullTime,
  fromNow,
  CODE_STATUS_TEXT,
  CODE_STATUS_TAG,
  ORDER_STATUS_TEXT,
  ORDER_STATUS_TAG,
} from '@/utils/adminFormat'

/**
 * 用户管理。
 *
 * 这是原来 `npm run member phone / guser / passwd` 三条命令的图形版，
 * 也是运营每天真正花时间的地方 —— 客服问「我付了钱怎么还是不能用」，
 * 运营要能在 10 秒内查到他、看清状态、决定是补时长还是重置密码。
 *
 * 手机号在这里**完整展示**：这是内部管理界面，打码了就没法核对付款人。
 */
const adminStore = useAdminStore()
const refreshPendingCount = inject('refreshPendingCount', () => {})

const loading = ref(false)
const rows = ref([])
const total = ref(0)

const query = reactive({
  keyword: '',
  filter: 'all',
  sort: 'recent',
  page: 1,
  pageSize: 20,
})

const FILTERS = [
  { value: 'all', label: '全部用户' },
  { value: 'member', label: '有效会员' },
  { value: 'expired', label: '会员已过期' },
  { value: 'never', label: '从未开通' },
  { value: 'trial', label: '领过新人礼' },
  { value: 'disabled', label: '已停用' },
]

const SORTS = [
  { value: 'recent', label: '注册时间' },
  { value: 'expires', label: '会员到期' },
  { value: 'amount', label: '累计消费' },
  { value: 'login', label: '最后登录' },
]

// ---------------------------------------------------------------- 列表

async function load() {
  loading.value = true
  try {
    const data = await fetchAccounts({ ...query })
    rows.value = data.items || []
    total.value = data.total || 0
  } catch (error) {
    ElMessage.error(adminErrorMessage(error, '用户列表加载失败'))
  } finally {
    loading.value = false
  }
}

function search() {
  query.page = 1
  load()
}

function resetFilters() {
  query.keyword = ''
  query.filter = 'all'
  query.sort = 'recent'
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

// ---------------------------------------------------------------- 赠送会员

const grantDialog = reactive({
  visible: false,
  account: null,
  mode: 'days',
  days: 30,
  plan: 'year',
  note: '',
  submitting: false,
})

const planOptions = computed(() => adminStore.planOptions.filter((p) => p.key !== 'trial'))

/** 展示叠加后的到期日，避免运营误以为"改成 X 天"而不是"再加 X 天" */
const grantPreview = computed(() => {
  const account = grantDialog.account
  if (!account) return ''
  const days = grantDialog.mode === 'plan'
    ? (planOptions.value.find((p) => p.key === grantDialog.plan)?.durationDays || 0)
    : Number(grantDialog.days) || 0
  if (!days) return ''
  const base = Math.max(Number(account.expiresAt || 0), Date.now())
  const next = new Date(base + days * 86400000)
  return `叠加 ${days} 天后到期：${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
})

function openGrant(row) {
  Object.assign(grantDialog, {
    visible: true,
    account: row,
    mode: 'days',
    days: 30,
    plan: 'year',
    note: '',
    submitting: false,
  })
}

async function submitGrant() {
  if (!grantDialog.account) return
  const payload = grantDialog.mode === 'plan'
    ? { plan: grantDialog.plan, note: grantDialog.note }
    : { days: Number(grantDialog.days), note: grantDialog.note }

  if (grantDialog.mode === 'days' && (!payload.days || payload.days < 1)) {
    ElMessage.warning('请填写有效的天数')
    return
  }

  grantDialog.submitting = true
  try {
    const result = await grantMembership(grantDialog.account.id, payload)
    ElMessage.success(
      `已开通，现在剩余 ${result.account?.daysLeft ?? '-'} 天`
      + (result.renewed ? '（在原到期日基础上叠加）' : ''),
    )
    grantDialog.visible = false
    await load()
  } catch (error) {
    ElMessage.error(adminErrorMessage(error, '开通失败'))
  } finally {
    grantDialog.submitting = false
  }
}

// ---------------------------------------------------------------- 重置密码

const pwDialog = reactive({
  visible: false,
  account: null,
  password: '',
  confirm: '',
  submitting: false,
})

const pwMin = computed(() => Number(adminStore.meta?.authPolicy?.passwordMin) || 8)
const pwMax = computed(() => Number(adminStore.meta?.authPolicy?.passwordMax) || 32)

function openPassword(row) {
  Object.assign(pwDialog, {
    visible: true,
    account: row,
    password: '',
    confirm: '',
    submitting: false,
  })
}

async function submitPassword() {
  if (pwDialog.password.length < pwMin.value) {
    ElMessage.warning(`密码至少 ${pwMin.value} 位`)
    return
  }
  if (pwDialog.password !== pwDialog.confirm) {
    ElMessage.warning('两次输入的密码不一致')
    return
  }

  pwDialog.submitting = true
  try {
    const result = await resetAccountPassword(pwDialog.account.id, { password: pwDialog.password })
    ElMessage.success(result.message || '密码已重置')
    pwDialog.visible = false
  } catch (error) {
    ElMessage.error(adminErrorMessage(error, '重置失败'))
  } finally {
    pwDialog.submitting = false
  }
}

/** 生成一个可念的随机密码，省得运营想一个还要念给用户听 */
function randomPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 10; i += 1) out += chars[Math.floor(Math.random() * chars.length)]
  pwDialog.password = out
  pwDialog.confirm = out
}

// ---------------------------------------------------------------- 停用 / 启用

async function toggleStatus(row) {
  const next = row.status === 'active' ? 'disabled' : 'active'
  const isDisable = next === 'disabled'

  try {
    await ElMessageBox.confirm(
      isDisable
        ? `停用后 ${row.phone} 将无法登录，且当前所有登录态立即失效。确认停用？`
        : `确认恢复 ${row.phone} 的登录权限？`,
      isDisable ? '停用账号' : '启用账号',
      { type: isDisable ? 'warning' : 'info', confirmButtonText: '确认' },
    )
  } catch (_) {
    return
  }

  try {
    await setAccountStatus(row.id, { status: next })
    ElMessage.success(isDisable ? '已停用' : '已启用')
    await load()
  } catch (error) {
    ElMessage.error(adminErrorMessage(error, '操作失败'))
  }
}

// ---------------------------------------------------------------- 详情抽屉

const detail = reactive({
  visible: false,
  loading: false,
  data: null,
  tab: 'orders',
})

async function openDetail(row) {
  Object.assign(detail, { visible: true, loading: true, data: null, tab: 'orders' })
  try {
    detail.data = await fetchAccountDetail(row.id)
  } catch (error) {
    ElMessage.error(adminErrorMessage(error, '详情加载失败'))
    detail.visible = false
  } finally {
    detail.loading = false
  }
}

function copyPhone(phone) {
  navigator.clipboard?.writeText(phone)
    .then(() => ElMessage.success('手机号已复制'))
    .catch(() => ElMessage.info(phone))
}

onMounted(async () => {
  await adminStore.loadMeta()
  await load()
})
</script>

<template>
  <div class="admin-users">
    <!-- 筛选条 -->
    <section class="panel filter-bar">
      <el-input
        v-model="query.keyword"
        placeholder="搜索手机号 / 用户ID"
        clearable
        style="width: 240px"
        @keyup.enter="search"
        @clear="search"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>

      <el-select v-model="query.filter" style="width: 140px" @change="search">
        <el-option v-for="f in FILTERS" :key="f.value" :label="f.label" :value="f.value" />
      </el-select>

      <el-select v-model="query.sort" style="width: 130px" @change="search">
        <el-option v-for="s in SORTS" :key="s.value" :label="`按${s.label}`" :value="s.value" />
      </el-select>

      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>

      <div class="filter-spacer" />
      <span class="total-hint">共 {{ total }} 个用户</span>
    </section>

    <!-- 列表 -->
    <section class="panel">
      <el-table v-loading="loading" :data="rows" size="small" style="width: 100%">
        <el-table-column prop="id" label="ID" width="66" />

        <el-table-column label="手机号" width="136">
          <template #default="{ row }">
            <span class="phone" @click="copyPhone(row.phone)">{{ row.phone }}</span>
            <el-tag v-if="row.status !== 'active'" type="danger" size="small" effect="plain" class="tag-gap">
              停用
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="会员状态" width="176">
          <template #default="{ row }">
            <el-tag v-if="row.isMember" type="success" size="small" effect="plain">
              {{ row.planName }} · 剩 {{ row.daysLeft }} 天
            </el-tag>
            <el-tag v-else-if="row.expired" type="info" size="small" effect="plain">已过期</el-tag>
            <el-tag v-else type="warning" size="small" effect="plain">未开通</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="到期时间" width="118">
          <template #default="{ row }">
            <span :class="{ muted: !row.everMember }">
              {{ row.everMember ? formatTime(row.expiresAt).slice(0, 10) : '-' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="渠道" width="104">
          <template #default="{ row }">{{ row.channel || '直接访问' }}</template>
        </el-table-column>

        <el-table-column label="消费" width="104">
          <template #default="{ row }">
            <span :class="{ amount: row.paidAmount > 0 }">
              {{ row.paidAmount > 0 ? formatMoney(row.paidAmount) : '-' }}
            </span>
            <span v-if="row.orderCount" class="muted"> / {{ row.orderCount }}单</span>
          </template>
        </el-table-column>

        <el-table-column label="注册时间" width="140">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
            <div class="muted small">{{ fromNow(row.createdAt) }}</div>
          </template>
        </el-table-column>

        <el-table-column label="最后登录" min-width="120">
          <template #default="{ row }">
            <span :class="{ muted: !row.lastLoginAt }">
              {{ row.lastLoginAt ? fromNow(row.lastLoginAt) : '从未登录' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="228" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openGrant(row)">赠送会员</el-button>
            <el-button type="primary" link size="small" @click="openPassword(row)">重置密码</el-button>
            <el-button link size="small" @click="openDetail(row)">详情</el-button>
            <el-button
              :type="row.status === 'active' ? 'danger' : 'success'"
              link
              size="small"
              @click="toggleStatus(row)"
            >{{ row.status === 'active' ? '停用' : '启用' }}</el-button>
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

    <!-- 赠送会员 -->
    <el-dialog v-model="grantDialog.visible" title="赠送 / 补偿会员" width="460px">
      <div v-if="grantDialog.account" class="dialog-body">
        <div class="account-line">
          <span class="account-phone">{{ grantDialog.account.phone }}</span>
          <span class="muted">
            {{ grantDialog.account.isMember
              ? `当前会员：${grantDialog.account.planName}，剩 ${grantDialog.account.daysLeft} 天`
              : '当前非会员' }}
          </span>
        </div>

        <el-radio-group v-model="grantDialog.mode" class="mode-group">
          <el-radio-button value="days">按天数</el-radio-button>
          <el-radio-button value="plan">按套餐</el-radio-button>
        </el-radio-group>

        <div v-if="grantDialog.mode === 'days'" class="quick-days">
          <el-button
            v-for="d in [7, 30, 90, 365]"
            :key="d"
            size="small"
            :type="Number(grantDialog.days) === d ? 'primary' : 'default'"
            @click="grantDialog.days = d"
          >{{ d }} 天</el-button>
          <el-input-number v-model="grantDialog.days" :min="1" :max="3650" size="small" style="width: 130px" />
        </div>

        <el-select v-else v-model="grantDialog.plan" style="width: 100%">
          <el-option
            v-for="p in planOptions"
            :key="p.key"
            :label="`${p.name}（${p.durationDays} 天）`"
            :value="p.key"
          />
        </el-select>

        <p class="preview">{{ grantPreview }}</p>

        <el-input
          v-model="grantDialog.note"
          placeholder="备注（例如：朋友赠送 / 客诉补偿），仅记入审计日志"
          maxlength="100"
        />
      </div>

      <template #footer>
        <el-button @click="grantDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="grantDialog.submitting" @click="submitGrant">
          确认开通
        </el-button>
      </template>
    </el-dialog>

    <!-- 重置密码 -->
    <el-dialog v-model="pwDialog.visible" title="重置用户密码" width="440px">
      <div v-if="pwDialog.account" class="dialog-body">
        <p class="warn-line">
          将重置 <strong>{{ pwDialog.account.phone }}</strong> 的密码。
          执行后该账号所有设备上的登录态会立即失效，需要把新密码告诉用户。
        </p>

        <el-input
          v-model="pwDialog.password"
          placeholder="新密码"
          show-password
          maxlength="32"
        >
          <template #append>
            <el-button @click="randomPassword">随机生成</el-button>
          </template>
        </el-input>

        <el-input
          v-model="pwDialog.confirm"
          placeholder="再次输入新密码"
          show-password
          maxlength="32"
        />

        <p class="tiny-hint">长度 {{ pwMin }}-{{ pwMax }} 位。请通过电话或微信告诉用户本人。</p>
      </div>

      <template #footer>
        <el-button @click="pwDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="pwDialog.submitting" @click="submitPassword">
          确认重置
        </el-button>
      </template>
    </el-dialog>

    <!-- 详情抽屉 -->
    <el-drawer v-model="detail.visible" size="680px" :title="detail.data ? `用户详情 · ${detail.data.account.phone}` : '用户详情'">
      <div v-loading="detail.loading" class="detail-body">
        <template v-if="detail.data">
          <div class="detail-head">
            <div class="detail-item">
              <span class="detail-label">账号 ID</span>
              <span class="detail-value">#{{ detail.data.account.id }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">状态</span>
              <span class="detail-value">{{ detail.data.account.status === 'active' ? '正常' : '已停用' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">会员</span>
              <span class="detail-value">
                {{ detail.data.account.isMember
                  ? `${detail.data.account.planName}，剩 ${detail.data.account.daysLeft} 天`
                  : (detail.data.account.expired ? '已过期' : '未开通') }}
              </span>
            </div>
            <div class="detail-item">
              <span class="detail-label">到期</span>
              <span class="detail-value">{{ detail.data.account.everMember ? formatFullTime(detail.data.account.expiresAt) : '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">注册</span>
              <span class="detail-value">{{ formatFullTime(detail.data.account.createdAt) }}（{{ detail.data.account.channel || '直接访问' }}）</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">新人礼</span>
              <span class="detail-value">{{ detail.data.account.trialGranted ? '已领取' : '未领取' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">密码</span>
              <span class="detail-value">{{ detail.data.account.hasPassword ? '已设置' : '未设置' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">注册 IP</span>
              <span class="detail-value">{{ detail.data.account.registerIp || '-' }}</span>
            </div>
          </div>

          <el-tabs v-model="detail.tab">
            <el-tab-pane :label="`订单 (${detail.data.orders.length})`" name="orders">
              <el-table :data="detail.data.orders" size="small" empty-text="暂无订单">
                <el-table-column prop="orderNo" label="订单号" width="152" />
                <el-table-column prop="planName" label="套餐" width="96" />
                <el-table-column label="金额" width="92">
                  <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
                </el-table-column>
                <el-table-column label="状态" width="86">
                  <template #default="{ row }">
                    <el-tag :type="ORDER_STATUS_TAG[row.status]" size="small" effect="plain">
                      {{ ORDER_STATUS_TEXT[row.status] || row.status }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="时间" min-width="130">
                  <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
                </el-table-column>
              </el-table>
            </el-tab-pane>

            <el-tab-pane :label="`设备 (${detail.data.devices.length})`" name="devices">
              <el-table :data="detail.data.devices" size="small" empty-text="暂无绑定设备">
                <el-table-column prop="deviceId" label="设备标识" min-width="180" show-overflow-tooltip />
                <el-table-column prop="channel" label="渠道" width="100" />
                <el-table-column label="最后活跃" width="140">
                  <template #default="{ row }">{{ fromNow(row.lastSeenAt) }}</template>
                </el-table-column>
              </el-table>
            </el-tab-pane>

            <el-tab-pane :label="`激活码 (${detail.data.codes.length})`" name="codes">
              <el-table :data="detail.data.codes" size="small" empty-text="暂无核销记录">
                <el-table-column prop="code" label="激活码" width="152" />
                <el-table-column prop="planName" label="套餐" width="100" />
                <el-table-column prop="durationDays" label="天数" width="66" />
                <el-table-column prop="channel" label="渠道" width="96" />
                <el-table-column label="状态" width="86">
                  <template #default="{ row }">
                    <el-tag :type="CODE_STATUS_TAG[row.status]" size="small" effect="plain">
                      {{ CODE_STATUS_TEXT[row.status] || row.status }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="核销时间" min-width="130">
                  <template #default="{ row }">{{ formatTime(row.usedAt) }}</template>
                </el-table-column>
              </el-table>
            </el-tab-pane>

            <el-tab-pane :label="`登录 (${detail.data.sessions.length})`" name="sessions">
              <el-table :data="detail.data.sessions" size="small" empty-text="暂无有效登录态">
                <el-table-column prop="tokenHint" label="会话" width="100" />
                <el-table-column prop="ip" label="IP" width="126" />
                <el-table-column label="客户端" min-width="180" show-overflow-tooltip>
                  <template #default="{ row }">{{ row.userAgent || '-' }}</template>
                </el-table-column>
                <el-table-column label="最近使用" width="130">
                  <template #default="{ row }">{{ fromNow(row.lastSeenAt) }}</template>
                </el-table-column>
              </el-table>
            </el-tab-pane>

            <el-tab-pane :label="`行为 (${detail.data.events.length})`" name="events">
              <el-table :data="detail.data.events" size="small" empty-text="暂无行为记录">
                <el-table-column prop="event" label="事件" width="140" />
                <el-table-column prop="path" label="路径" width="140" />
                <el-table-column prop="meta" label="附加信息" min-width="150" show-overflow-tooltip />
                <el-table-column label="时间" width="140">
                  <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
                </el-table-column>
              </el-table>
            </el-tab-pane>
          </el-tabs>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.admin-users {
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

.phone {
  font-weight: 600;
  color: var(--color-text-primary);
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}

.phone:hover { color: var(--color-rise); }

.tag-gap { margin-left: 6px; }

.amount {
  font-weight: 600;
  color: var(--color-rise);
  font-variant-numeric: tabular-nums;
}

.muted { color: var(--color-text-muted); }
.small { font-size: 11px; }

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.account-line {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.account-phone {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.mode-group { align-self: flex-start; }

.quick-days {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.preview {
  margin: 0;
  font-size: 12px;
  color: var(--color-accent);
  background: rgba(249, 115, 22, 0.08);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
}

.warn-line {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  background: var(--color-rise-soft);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}

.tiny-hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--color-text-muted);
}

.detail-body { min-height: 200px; }

.detail-head {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 18px;
  padding: 14px;
  border-radius: var(--radius-md);
  background: var(--color-bg-base);
  margin-bottom: 16px;
}

.detail-item { display: flex; flex-direction: column; gap: 3px; }

.detail-label {
  font-size: 11px;
  color: var(--color-text-muted);
}

.detail-value {
  font-size: 12.5px;
  color: var(--color-text-primary);
  font-weight: 500;
}
</style>
