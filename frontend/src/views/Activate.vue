<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Check, CopyDocument, Key, Promotion } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { fetchPlans } from '@/api'
import { MEMBER_CONFIG } from '@/config/member'
import { track } from '@/utils/track'
import PayDialog from '@/components/member/PayDialog.vue'

/**
 * 开通 / 续费会员页。
 *
 * 两条路都能走通，且对「已是会员」的用户同样开放：
 * 1. 站内收款码（主流）：选套餐 → 扫码付款 → 后台核对到账后开通，全程不跳转。
 * 2. 激活码兑换：渠道商或线下售卖的码，在这里兑换；续费会在原到期日上叠加。
 *
 * 这里刻意不再按 isMember 隐藏套餐区 —— 注册即送试用，试用用户也是会员态，
 * 之前用 !isMember 挡住会让「想升级成正式会员」的人看不到任何付款入口。
 * 独立页面（而非弹窗）的理由：这个链接要能直接发给用户
 * （比如付款后自动回复里带上 https://域名/activate）。
 */
const router = useRouter()
const userStore = useUserStore()

const codeInput = ref('')
const submitting = ref(false)
const plans = ref([])
const payVisible = ref(false)

const isMember = computed(() => userStore.canUseVoice)

/**
 * 激活码格式化：边输边补横线，并把字母统一成大写。
 * 用户拿到的码是 DXY-7K3M-9PQZ 这种带横线的形式，让他自己敲横线很容易错，
 * 所以这里统一替他补 —— 后端也会做一次归一化，两边都不依赖对方。
 */
function formatCode(raw) {
  const clean = String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 11)

  const parts = []
  if (clean.length) parts.push(clean.slice(0, 3))
  if (clean.length > 3) parts.push(clean.slice(3, 7))
  if (clean.length > 7) parts.push(clean.slice(7, 11))
  return parts.join('-')
}

function onCodeInput(value) {
  codeInput.value = formatCode(value)
}

async function onSubmit() {
  const code = codeInput.value.trim()
  if (code.replace(/-/g, '').length < 11) {
    ElMessage.warning('请输入完整的激活码')
    return
  }

  submitting.value = true
  try {
    const result = await userStore.redeem(code)
    const renewedText = result.renewed ? '（已在原到期时间上叠加）' : ''
    ElMessage({
      type: 'success',
      message: `${result.planName}开通成功${renewedText}，语音播报已解锁`,
      duration: 5000,
      showClose: true,
    })
    codeInput.value = ''
  } catch (error) {
    ElMessage({
      type: 'error',
      message: error.response?.data?.error || '激活失败，请稍后再试',
      duration: 5000,
      showClose: true,
    })
  } finally {
    submitting.value = false
  }
}

async function copyDeviceId() {
  try {
    await navigator.clipboard.writeText(userStore.deviceId)
    ElMessage.success('设备标识已复制，可发给客服排查')
  } catch (_) {
    ElMessage.warning(`请手动复制：${userStore.deviceId}`)
  }
}

/** 站内收款码：未登录先去登录，登录后直接弹付款二维码 */
function openPay() {
  if (!userStore.loggedIn) {
    track('pay_click', { scene: 'activate_page', target: 'login' })
    router.push({ path: '/login', query: { redirect: '/activate' } })
    return
  }
  track('pay_click', { scene: 'activate_page', target: 'qrcode' })
  payVisible.value = true
}

/** 外部收款链接（可选）：没配 purchaseUrl 时页面上不出现这个按钮 */
function goPurchase() {
  track('pay_click', { scene: 'activate_page', target: 'external' })
  window.open(MEMBER_CONFIG.purchaseUrl, '_blank', 'noopener')
}

onMounted(() => {
  userStore.bootstrap()
  fetchPlans()
    .then((data) => {
      plans.value = Array.isArray(data?.plans) ? data.plans : []
    })
    .catch(() => {
      plans.value = []
    })
})
</script>

<template>
  <div class="page activate-page">
    <div class="page-header">
      <div>
        <div class="page-kicker">MEMBERSHIP</div>
        <h2 class="page-title">开通会员</h2>
        <p class="page-lead">免费版可以看完整的涨停播报表格；会员解锁语音播报，让新涨停自己出声。</p>
      </div>
    </div>

    <!-- 当前状态 -->
    <section class="status-card" :class="{ 'is-member': isMember }">
      <div class="status-main">
        <div class="status-icon">
          <el-icon><component :is="isMember ? Promotion : Key" /></el-icon>
        </div>
        <div>
          <div class="status-title">
            {{ isMember ? `${userStore.planName}已开通` : '当前为免费版' }}
          </div>
          <div class="status-desc">
            <template v-if="isMember">
              到期时间 {{ userStore.expiresAtText }} · 剩余 {{ userStore.daysLeft }} 天
              <span v-if="userStore.expiringSoon" class="status-warn">即将到期</span>
            </template>
            <template v-else>
              语音播报未解锁，涨停播报表格与板块统计均可正常使用
            </template>
          </div>
        </div>
      </div>
    </section>

    <!-- 激活码兑换 -->
    <section class="panel">
      <h3 class="panel-title">
        <el-icon><Key /></el-icon>
        激活码兑换
      </h3>
      <p class="panel-desc">
        {{ isMember ? '续费激活码会在当前到期时间上继续叠加，不会覆盖剩余天数。' : '输入你拿到的激活码即可解锁会员功能。' }}
      </p>

      <div class="code-row">
        <el-input
          :model-value="codeInput"
          size="large"
          placeholder="DXY-XXXX-XXXX"
          maxlength="14"
          class="code-input"
          @update:model-value="onCodeInput"
          @keyup.enter="onSubmit"
        />
        <el-button
          type="primary"
          size="large"
          :loading="submitting"
          class="code-submit"
          @click="onSubmit"
        >
          {{ submitting ? '激活中' : '立即激活' }}
        </el-button>
      </div>

      <p class="panel-hint">
        激活码不区分大小写，横线可以不输。
      </p>
    </section>

    <!-- 套餐：会员同样可见，用于续费（时长从原到期日叠加） -->
    <section v-if="plans.length" class="panel">
      <h3 class="panel-title">
        <el-icon><Promotion /></el-icon>
        {{ isMember ? '续费会员' : '会员套餐' }}
      </h3>
      <p v-if="isMember" class="panel-desc">
        续费时长从当前到期日（{{ userStore.expiresAtText }}）继续叠加，不会覆盖剩余天数。
      </p>
      <div class="plan-grid">
        <div v-for="plan in plans" :key="plan.key" class="plan-card">
          <div class="plan-name">{{ plan.name }}</div>
          <div class="plan-price"><i>¥</i>{{ plan.price }}</div>
          <div class="plan-days">{{ plan.durationDays }} 天</div>
        </div>
      </div>
      <ul class="benefit-list">
        <li v-for="(item, index) in MEMBER_CONFIG.memberFeatures" :key="index">
          <span class="benefit-check"><el-icon><Check /></el-icon></span>
          <span>{{ item }}</span>
        </li>
      </ul>

      <div class="panel-actions">
        <el-button type="primary" @click="openPay">
          {{ isMember ? '扫码续费' : '扫码付款开通' }}
        </el-button>
        <el-button v-if="MEMBER_CONFIG.purchaseUrl" @click="goPurchase">
          其他方式开通
        </el-button>
        <span v-if="MEMBER_CONFIG.contactText" class="channel-hint">
          也可联系 {{ MEMBER_CONFIG.contactText }} 人工开通
        </span>
      </div>
    </section>

    <!-- 设备标识：排查问题时最有用的一条信息（权益本身绑账号，不绑设备） -->
    <section class="panel panel-muted">
      <div class="device-row">
        <div>
          <div class="device-label">当前设备标识</div>
          <div class="device-value">{{ userStore.deviceId || '生成中…' }}</div>
        </div>
        <el-button size="small" @click="copyDeviceId">
          <el-icon><CopyDocument /></el-icon>
          复制
        </el-button>
      </div>
      <p class="device-note">
        会员权益绑定在你的<strong>账号</strong>上，换电脑、清浏览器缓存都不会丢。
        上面这串是设备标识，仅在需要客服协助排查问题时提供。
      </p>
    </section>

    <p class="page-disclaimer">
      本工具仅提供公开行情数据的展示与提醒，不提供任何买卖建议，不构成投资建议。
      市场有风险，投资需谨慎。
    </p>

    <PayDialog v-model="payVisible" scene="activate_page" />
  </div>
</template>

<style scoped>
.activate-page {
  max-width: 760px;
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
  line-height: 1.7;
}

.status-card {
  margin: 18px 0;
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-card);
}

.status-card.is-member {
  border-color: var(--color-rise);
  background: var(--color-rise-soft);
}

.status-main {
  display: flex;
  align-items: center;
  gap: 14px;
}

.status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--color-bg-base);
  color: var(--color-rise);
  font-size: 20px;
}

.status-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.status-desc {
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--color-text-secondary);
}

.status-warn {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(249, 115, 22, 0.16);
  color: #ea580c;
  font-size: 11px;
  font-weight: 600;
}

.panel {
  margin-bottom: 18px;
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-card);
}

.panel-muted {
  background: var(--color-bg-base);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.panel-desc {
  margin: 0 0 14px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.code-row {
  display: flex;
  gap: 10px;
}

.code-input {
  flex: 1;
}

.code-input :deep(.el-input__inner) {
  letter-spacing: 0.14em;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 16px;
}

.code-submit {
  flex-shrink: 0;
}

.panel-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

.plan-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.plan-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 10px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-base);
}

.plan-name {
  font-size: 12.5px;
  color: var(--color-text-secondary);
}

.plan-price {
  font-size: 26px;
  font-weight: 800;
  line-height: 1.1;
  color: var(--color-rise);
}

.plan-price i {
  font-size: 14px;
  font-style: normal;
  margin-right: 1px;
}

.plan-days {
  font-size: 11px;
  color: var(--color-text-muted);
}

.benefit-list {
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.benefit-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.benefit-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--color-rise);
  color: #fff;
  font-size: 11px;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.channel-hint {
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-muted);
}

.device-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.device-label {
  font-size: 12px;
  color: var(--color-text-muted);
}

.device-value {
  margin-top: 4px;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12.5px;
  color: var(--color-text-primary);
  word-break: break-all;
}

.device-note {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-text-muted);
}

.device-note strong {
  color: var(--color-text-secondary);
}

.page-disclaimer {
  margin: 24px 0 8px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-text-muted);
}

@media (max-width: 600px) {
  .code-row {
    flex-direction: column;
  }
}
</style>
