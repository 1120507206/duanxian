<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  fetchCodes,
  exportCodes,
  generateCodes,
  voidCode,
  rebindCode,
  adminErrorMessage,
} from '@/api/admin'
import { useAdminStore } from '@/stores/admin'
import {
  formatTime,
  fromNow,
  CODE_STATUS_TEXT,
  CODE_STATUS_TAG,
} from '@/utils/adminFormat'

/**
 * 激活码管理。
 *
 * 激活码是「预付商品」：先批量生成，用户付款后发一个。
 * 所以这一页要解决两件事：
 *   1. 发放 —— 生成一批、导出纯码列表，直接复制到微信发给用户；
 *   2. 救火 —— 用户换电脑 / 清缓存后，把已用的码迁移到新设备。
 *
 * 一个必须说清楚的事实：账户体系上线后，用户登录状态下兑换的码是核销到
 * **账号**上的，权益跟着人走，换设备只要重新登录即可，根本不需要迁移。
 * 迁移只对「未登录时在设备上兑换」的老路径有意义。所以界面上会明确提示。
 */
const adminStore = useAdminStore()

const loading = ref(false)
const rows = ref([])
const total = ref(0)
const stats = reactive({ total: 0, unused: 0, used: 0, void: 0 })
const channels = ref([])

const query = reactive({
  status: 'all',
  plan: '',
  channel: '',
  keyword: '',
  page: 1,
  pageSize: 20,
})

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'unused', label: '未使用' },
  { value: 'used', label: '已使用' },
  { value: 'void', label: '已作废' },
]

const planOptions = computed(() => adminStore.planOptions)

async function load() {
  loading.value = true
  try {
    const data = await fetchCodes({ ...query })
    rows.value = data.items || []
    total.value = data.total || 0
    Object.assign(stats, data.stats || {})
    channels.value = data.channels || []
  } catch (error) {
    ElMessage.error(adminErrorMessage(error, '激活码加载失败'))
  } finally {
    loading.value = false
  }
}

function search() {
  query.page = 1
  load()
}

function resetFilters() {
  query.status = 'all'
  query.plan = ''
  query.channel = ''
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

// ---------------------------------------------------------------- 生成

const genDialog = reactive({
  visible: false,
  plan: 'year',
  count: 10,
  channel: '',
  batch: '',
  submitting: false,
})

const genResult = reactive({ visible: false, codes: [], title: '', text: '' })

function openGenerate() {
  Object.assign(genDialog, {
    visible: true,
    plan: 'year',
    count: 10,
    channel: query.channel || '',
    batch: '',
    submitting: false,
  })
}

async function submitGenerate() {
  if (!genDialog.count || genDialog.count < 1) {
    ElMessage.warning('请填写生成数量')
    return
  }

  genDialog.submitting = true
  try {
    const result = await generateCodes({
      plan: genDialog.plan,
      count: Number(genDialog.count),
      channel: genDialog.channel,
      batch: genDialog.batch,
    })
    genDialog.visible = false

    genResult.codes = result.codes || []
    genResult.title = `${result.planName}（${result.durationDays} 天）× ${result.codes.length}`
    genResult.text = genResult.codes.join('\n')
    genResult.visible = true

    await load()
  } catch (error) {
    ElMessage.error(adminErrorMessage(error, '生成失败'))
  } finally {
    genDialog.submitting = false
  }
}

// ---------------------------------------------------------------- 导出

async function runExport() {
  try {
    const result = await exportCodes({
      status: query.status === 'all' ? 'unused' : query.status,
      plan: query.plan,
      channel: query.channel,
    })

    if (!result.count) {
      ElMessage.warning('当前筛选条件下没有可导出的激活码')
      return
    }

    genResult.codes = result.codes
    genResult.title = `导出 ${result.count} 个激活码`
    genResult.text = result.codes.join('\n')
    genResult.visible = true
  } catch (error) {
    ElMessage.error(adminErrorMessage(error, '导出失败'))
  }
}

async function copyResult() {
  try {
    await navigator.clipboard.writeText(genResult.text)
    ElMessage.success('已复制到剪贴板')
  } catch (_) {
    ElMessage.info('浏览器不允许自动复制，请手动选中复制')
  }
}

function downloadResult() {
  const blob = new Blob([genResult.text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `激活码-${new Date().toISOString().slice(0, 10)}.txt`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------- 作废 / 迁移

async function doVoid(row) {
  try {
    await ElMessageBox.confirm(
      `确认作废 ${row.code}（${row.planName}）？作废后无法恢复，也无法再被激活。`,
      '作废激活码',
      { type: 'warning', confirmButtonText: '确认作废' },
    )
  } catch (_) {
    return
  }

  try {
    await voidCode(row.code)
    ElMessage.success('已作废')
    await load()
  } catch (error) {
    ElMessage.error(adminErrorMessage(error, '作废失败'))
  }
}

const rebindDialog = reactive({
  visible: false,
  row: null,
  deviceId: '',
  submitting: false,
})

function openRebind(row) {
  Object.assign(rebindDialog, { visible: true, row, deviceId: '', submitting: false })
}

async function submitRebind() {
  const deviceId = rebindDialog.deviceId.trim()
  if (deviceId.length < 8) {
    ElMessage.warning('设备标识至少 8 位，请让用户从浏览器里读出来')
    return
  }

  rebindDialog.submitting = true
  try {
    const result = await rebindCode(rebindDialog.row.code, { deviceId })
    ElMessage.success(result.message || '迁移成功')
    rebindDialog.visible = false
    await load()
  } catch (error) {
    ElMessage.error(adminErrorMessage(error, '迁移失败'))
  } finally {
    rebindDialog.submitting = false
  }
}

onMounted(async () => {
  await adminStore.loadMeta()
  await load()
})
</script>

<template>
  <div class="admin-codes">
    <div class="stat-strip">
      <div class="mini-stat">
        <span class="mini-label">总量</span>
        <span class="mini-value">{{ stats.total }}</span>
      </div>
      <div class="mini-stat">
        <span class="mini-label">可用</span>
        <span class="mini-value ok">{{ stats.unused }}</span>
      </div>
      <div class="mini-stat">
        <span class="mini-label">已使用</span>
        <span class="mini-value">{{ stats.used }}</span>
      </div>
      <div class="mini-stat">
        <span class="mini-label">已作废</span>
        <span class="mini-value muted-value">{{ stats.void }}</span>
      </div>
      <div class="stat-actions">
        <el-button type="primary" @click="openGenerate">
          <el-icon><Plus /></el-icon> 生成激活码
        </el-button>
        <el-button @click="runExport">
          <el-icon><Download /></el-icon> 导出纯码
        </el-button>
      </div>
    </div>

    <section class="panel">
      <div class="filter-bar">
        <el-select v-model="query.status" style="width: 130px" @change="search">
          <el-option v-for="s in STATUS_OPTIONS" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>

        <el-select v-model="query.plan" placeholder="全部套餐" clearable style="width: 140px" @change="search">
          <el-option v-for="p in planOptions" :key="p.key" :label="p.name" :value="p.key" />
        </el-select>

        <el-select v-model="query.channel" placeholder="全部渠道" clearable style="width: 150px" @change="search">
          <el-option v-for="c in channels" :key="c.channel" :label="`${c.channel}（${c.count}）`" :value="c.channel" />
        </el-select>

        <el-input
          v-model="query.keyword"
          placeholder="激活码 / 设备 / 批次"
          clearable
          style="width: 220px"
          @keyup.enter="search"
          @clear="search"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>

        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>

        <div class="filter-spacer" />
        <span class="total-hint">共 {{ total }} 条</span>
      </div>
    </section>

    <section class="panel">
      <el-table v-loading="loading" :data="rows" size="small" style="width: 100%">
        <el-table-column prop="code" label="激活码" width="152">
          <template #default="{ row }">
            <span class="code-text">{{ row.code }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="planName" label="套餐" width="102" />

        <el-table-column label="天数" width="70">
          <template #default="{ row }">{{ row.durationDays }}</template>
        </el-table-column>

        <el-table-column label="渠道" width="110">
          <template #default="{ row }">{{ row.channel || '未指定' }}</template>
        </el-table-column>

        <el-table-column prop="batch" label="批次" width="112">
          <template #default="{ row }">
            <span class="muted small">{{ row.batch || '-' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="CODE_STATUS_TAG[row.status]" size="small" effect="plain">
              {{ CODE_STATUS_TEXT[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="使用于" min-width="190">
          <template #default="{ row }">
            <template v-if="row.status === 'used'">
              <div v-if="row.usedByPhone" class="used-line">
                账号 {{ row.usedByPhone }}
                <el-tag size="small" type="success" effect="plain">权益在账号</el-tag>
              </div>
              <div v-else class="used-line muted">
                设备 {{ (row.usedByDevice || '').slice(0, 14) }}
              </div>
              <div class="muted small">{{ formatTime(row.usedAt) }}</div>
            </template>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>

        <el-table-column label="生成时间" width="130">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
            <div class="muted small">{{ fromNow(row.createdAt) }}</div>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'unused'">
              <el-button type="danger" link size="small" @click="doVoid(row)">作废</el-button>
            </template>
            <template v-else-if="row.status === 'used' && !row.usedByAccountId">
              <el-button type="primary" link size="small" @click="openRebind(row)">迁移设备</el-button>
            </template>
            <span v-else class="muted small">-</span>
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

    <!-- 生成 -->
    <el-dialog v-model="genDialog.visible" title="生成激活码" width="440px">
      <div class="dialog-body">
        <label class="field">
          <span class="field-label">套餐</span>
          <el-select v-model="genDialog.plan" style="width: 100%">
            <el-option
              v-for="p in planOptions.filter((x) => x.key !== 'trial')"
              :key="p.key"
              :label="`${p.name}（${p.durationDays} 天 / ¥${p.price}）`"
              :value="p.key"
            />
          </el-select>
        </label>

        <label class="field">
          <span class="field-label">数量</span>
          <el-input-number v-model="genDialog.count" :min="1" :max="2000" style="width: 100%" />
        </label>

        <label class="field">
          <span class="field-label">渠道标记（用于按渠道结算，别留空）</span>
          <el-input v-model="genDialog.channel" placeholder="例如 taobao / xianyu / friend" maxlength="32" />
        </label>

        <label class="field">
          <span class="field-label">批次（可选，默认按日期）</span>
          <el-input v-model="genDialog.batch" placeholder="例如 2026国庆" maxlength="32" />
        </label>
      </div>

      <template #footer>
        <el-button @click="genDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="genDialog.submitting" @click="submitGenerate">
          生成
        </el-button>
      </template>
    </el-dialog>

    <!-- 生成 / 导出结果 -->
    <el-dialog v-model="genResult.visible" :title="genResult.title" width="480px">
      <div class="result-body">
        <p class="result-warn">
          激活码等同现金。请不要放进网站目录或代码仓库 —— 一旦被公开抓取，
          别人就能白拿会员。<strong>发给谁就只发给谁。</strong>
        </p>
        <el-input
          :model-value="genResult.text"
          type="textarea"
          :rows="12"
          readonly
          resize="none"
        />
      </div>

      <template #footer>
        <el-button @click="genResult.visible = false">关闭</el-button>
        <el-button @click="downloadResult">下载 .txt</el-button>
        <el-button type="primary" @click="copyResult">复制全部</el-button>
      </template>
    </el-dialog>

    <!-- 迁移设备 -->
    <el-dialog v-model="rebindDialog.visible" title="迁移激活码到新设备" width="440px">
      <div v-if="rebindDialog.row" class="dialog-body">
        <p class="warn-line">
          激活码 <strong>{{ rebindDialog.row.code }}</strong> 当前绑定在设备
          <code>{{ rebindDialog.row.usedByDevice || '（未知）' }}</code> 上。
          填入用户新设备的标识后，权益会转移过去。
        </p>
        <el-input v-model="rebindDialog.deviceId" placeholder="新设备标识（前端生成的 UUID）" />
        <p class="tiny-hint">
          如果用户能登录账号，其实不需要迁移 —— 让他直接登录，权益在账号上，换设备自动跟随。
        </p>
      </div>

      <template #footer>
        <el-button @click="rebindDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="rebindDialog.submitting" @click="submitRebind">
          确认迁移
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-codes {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1600px;
}

.stat-strip {
  display: flex;
  align-items: center;
  gap: 26px;
  flex-wrap: wrap;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 14px 18px;
  box-shadow: var(--shadow-card);
}

.mini-stat { display: flex; flex-direction: column; gap: 3px; }

.mini-label {
  font-size: 11.5px;
  color: var(--color-text-muted);
}

.mini-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.mini-value.ok { color: var(--color-rise); }
.mini-value.muted-value { color: var(--color-text-muted); }

.stat-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
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

.code-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
  color: var(--color-text-primary);
  letter-spacing: 0.02em;
}

.used-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
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

.field { display: flex; flex-direction: column; gap: 6px; }

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.result-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-warn {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-accent);
  background: rgba(249, 115, 22, 0.08);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}

.warn-line {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  background: var(--color-bg-base);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}

.warn-line code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--color-text-primary);
}

.tiny-hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--color-text-muted);
  line-height: 1.6;
}
</style>
