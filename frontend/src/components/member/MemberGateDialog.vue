<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Check, Key, Promotion } from '@element-plus/icons-vue'
import { fetchPlans } from '@/api'
import { useUserStore } from '@/stores/user'
import { MEMBER_CONFIG } from '@/config/member'
import { track } from '@/utils/track'
import PayDialog from './PayDialog.vue'

/**
 * 会员引导 + 站内兑换弹窗。
 *
 * 关键设计：激活码输入**直接内联在弹窗里**，不做页面跳转。
 * 原因是主战场是通达信独立页 —— 那是个嵌在交易软件里的面板，一旦跳走，
 * 用户就得重新打开面板才能继续看盘，转化损失极大。让他在弹窗里输完码、
 * 语音当场解锁，是最短的路径。
 *
 * 主按钮会按登录状态切换，这是转化路径的核心分叉：
 * - 未登录 → 引导注册（注册即送 N 天，等于零成本试用，是最强的注册理由）
 * - 已登录 → 直接开收款码支付，不再绕路
 *
 * 文案原则：先说清楚免费版有什么，再说会员多什么。用户最怕「点进来才发现
 * 什么都要钱」，而免费版能看全表这件事本身就是最好的说服材料。
 *
 * 合规注意：全程不出现「荐股」「预测」「收益」这类表述，只描述工具能力。
 */
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 触发场景，用于埋点区分 */
  scene: { type: String, default: 'voice' },
})

const emit = defineEmits(['update:modelValue'])

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const plans = ref([])
const plansLoaded = ref(false)
const codeInput = ref('')
const submitting = ref(false)
const payVisible = ref(false)

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const trialDays = computed(() => userStore.trialDays || 30)

/** 标题按登录 / 会员状态切换：未登录卖「免费试用」，试用中卖「续费」，非会员卖「开通」 */
const titleText = computed(() => {
  if (!userStore.loggedIn) return `注册即送 ${trialDays.value} 天语音播报`
  return userStore.isMember ? '续费会员，语音不断档' : '开通会员解锁语音播报'
})

/** 主按钮文案与标题走同一套分支，避免「标题说续费、按钮说开通」的割裂 */
const primaryText = computed(() => {
  if (!userStore.loggedIn) return `注册领 ${trialDays.value} 天`
  return userStore.isMember ? '立即续费' : '立即开通会员'
})

/** 与激活页共用同一套格式化规则：统一大写、自动补横线 */
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

async function loadPlans() {
  if (plansLoaded.value) return
  try {
    const data = await fetchPlans()
    plans.value = Array.isArray(data?.plans) ? data.plans : []
  } catch (_) {
    // 套餐拉不到不影响兑换：用户手里有码就能开通
    plans.value = []
  } finally {
    plansLoaded.value = true
  }
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
    ElMessage({
      type: 'success',
      message: `${result.planName}开通成功，语音播报已解锁`,
      duration: 4000,
    })
    codeInput.value = ''
    visible.value = false
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

/**
 * 主按钮。
 * 未登录 → 跳注册（带 redirect，注册完回到原页面，语音当场可用）；
 * 已登录 → 直接弹收款码支付。
 */
function handlePrimary() {
  if (!userStore.loggedIn) {
    track('pay_click', { scene: props.scene, target: 'register' })
    visible.value = false
    router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }

  track('pay_click', { scene: props.scene, target: 'qrcode' })
  visible.value = false
  payVisible.value = true
}

function goContact() {
  track('pay_click', { scene: props.scene, target: 'contact' })
  if (!MEMBER_CONFIG.contactText) {
    ElMessage.info('收款通道尚未配置')
    return
  }
  ElMessage.info(`开通请联系：${MEMBER_CONFIG.contactText}`)
}

function copyDeviceId() {
  const id = userStore.deviceId
  if (!id) return
  navigator.clipboard?.writeText(id)
    .then(() => ElMessage.success('设备标识已复制，可发给客服'))
    .catch(() => ElMessage.warning(`请手动复制：${id}`))
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      loadPlans()
      // 收款方式与新人礼天数也一并拉：PayDialog 依赖它们，提前加载能少一次等待
      userStore.loadConfig()
      if (!userStore.ready) userStore.bootstrap()
    }
  },
)
</script>

<template>
  <el-dialog
    v-model="visible"
    width="580px"
    align-center
    class="member-gate-dialog"
    append-to-body
  >
    <template #header>
      <div class="mg-header">
        <span class="mg-header-icon"><el-icon><Promotion /></el-icon></span>
        <div>
          <h3 class="mg-title">{{ titleText }}</h3>
          <p class="mg-subtitle">免费版看全表，会员多一个「不用盯屏」</p>
        </div>
      </div>
    </template>

    <div class="mg-body">
      <div class="mg-compare">
        <div class="mg-col">
          <div class="mg-col-head">免费版</div>
          <ul class="mg-list">
            <li v-for="(item, index) in MEMBER_CONFIG.freeFeatures" :key="index">
              <span class="mg-check mg-check-free"><el-icon><Check /></el-icon></span>
              <span>{{ item }}</span>
            </li>
          </ul>
        </div>

        <div class="mg-col mg-col-member">
          <div class="mg-col-head">会员版</div>
          <ul class="mg-list">
            <li v-for="(item, index) in MEMBER_CONFIG.memberFeatures" :key="index">
              <span class="mg-check mg-check-member"><el-icon><Check /></el-icon></span>
              <span>{{ item }}</span>
            </li>
          </ul>
        </div>
      </div>

      <p class="mg-note">
        语音只播报你打开页面之后<strong>新出现</strong>的涨停与炸板，
        不会把当天几十只票从头念一遍。可以先点「试听」听听效果。
      </p>

      <!-- 站内兑换：不离开当前页面（通达信面板场景的关键） -->
      <div class="mg-redeem">
        <div class="mg-redeem-title">
          <el-icon><Key /></el-icon>
          已有激活码，直接开通
        </div>
        <div class="mg-redeem-row">
          <el-input
            :model-value="codeInput"
            placeholder="DXY-XXXX-XXXX"
            maxlength="14"
            class="mg-code-input"
            @update:model-value="(v) => (codeInput = formatCode(v))"
            @keyup.enter="onSubmit"
          />
          <el-button type="primary" :loading="submitting" @click="onSubmit">
            {{ submitting ? '激活中' : '立即激活' }}
          </el-button>
        </div>
        <p class="mg-redeem-hint">
          不区分大小写，横线可以不输。
          <a href="#" v-if="userStore.deviceId" @click.prevent="copyDeviceId">复制设备标识（发给客服）</a>
        </p>
      </div>

      <div v-if="plans.length" class="mg-plans">
        <div v-for="plan in plans" :key="plan.key" class="mg-plan">
          <span class="mg-plan-name">{{ plan.name }}</span>
          <span class="mg-plan-price"><i>¥</i>{{ plan.price }}</span>
          <span class="mg-plan-days">{{ plan.durationDays }} 天</span>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="mg-footer">
        <button type="button" class="mg-btn mg-btn-ghost" @click="visible = false">先看看</button>
        <button type="button" class="mg-btn mg-btn-primary" @click="handlePrimary">
          {{ primaryText }}
        </button>
      </div>
      <p v-if="MEMBER_CONFIG.contactText" class="mg-footer-hint">
        有问题可联系 {{ MEMBER_CONFIG.contactText }}
      </p>
      <p class="mg-disclaimer">本工具仅提供公开行情数据展示，不构成任何投资建议。</p>
    </template>

    <!-- 收款码支付：独立弹窗，关掉它不会连付费引导一起关掉 -->
    <PayDialog v-model="payVisible" :scene="props.scene" />
  </el-dialog>
</template>

<style scoped>
.mg-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mg-header-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--color-rise-soft);
  color: var(--color-rise);
  font-size: 18px;
}

.mg-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.mg-subtitle {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

.mg-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.mg-compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.mg-col {
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-card);
}

.mg-col-member {
  border-color: var(--color-rise);
  background: var(--color-rise-soft);
}

.mg-col-head {
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.mg-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mg-list li {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.mg-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  margin-top: 1px;
  flex-shrink: 0;
  border-radius: 50%;
  font-size: 10px;
}

.mg-check-free {
  background: var(--color-border);
  color: var(--color-text-muted);
}

.mg-check-member {
  background: var(--color-rise);
  color: #fff;
}

.mg-note {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--color-bg-base);
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.mg-note strong {
  color: var(--color-rise);
}

.mg-redeem {
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-base);
}

.mg-redeem-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.mg-redeem-row {
  display: flex;
  gap: 8px;
}

.mg-code-input {
  flex: 1;
}

.mg-code-input :deep(.el-input__inner) {
  letter-spacing: 0.12em;
  font-family: var(--font-mono, ui-monospace, monospace);
}

.mg-redeem-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--color-text-muted);
}

.mg-redeem-hint a {
  color: var(--color-rise);
  text-decoration: none;
  white-space: nowrap;
}

.mg-plans {
  display: flex;
  gap: 10px;
}

.mg-plan {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 12px 8px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-card);
}

.mg-plan-name {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.mg-plan-price {
  font-size: 22px;
  font-weight: 800;
  line-height: 1.1;
  color: var(--color-rise);
}

.mg-plan-price i {
  font-size: 13px;
  font-style: normal;
  margin-right: 1px;
}

.mg-plan-days {
  font-size: 11px;
  color: var(--color-text-muted);
}

.mg-footer {
  display: flex;
  gap: 10px;
}

.mg-btn {
  flex: 1;
  padding: 11px 16px;
  border-radius: 9px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--color-border);
  background: var(--color-bg-card);
  color: var(--color-text-secondary);
  transition: all 0.16s ease;
}

.mg-btn-ghost:hover {
  color: var(--color-text-primary);
  border-color: var(--color-border-light);
}

.mg-btn-primary {
  border-color: transparent;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  color: #fff;
}

.mg-btn-primary:hover {
  filter: brightness(1.06);
}

.mg-footer-hint {
  margin: 10px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
}

.mg-disclaimer {
  margin: 8px 0 0;
  text-align: center;
  font-size: 11px;
  color: var(--color-text-muted);
}

@media (max-width: 560px) {
  .mg-compare {
    grid-template-columns: 1fr;
  }
}
</style>
