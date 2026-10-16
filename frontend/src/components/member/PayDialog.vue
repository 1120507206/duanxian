<script setup>
/**
 * 收款码支付弹窗（个人微信 / 支付宝）。
 *
 * 流程：选套餐 → 生成订单 → 展示收款码和**精确金额** → 用户扫码付款 →
 * 点「我已付款」→ 等我们核对账单 → 开通。
 *
 * 两个反直觉但必须这么做的设计：
 * 1. 金额带角分尾数（如 ¥268.02）。个人收款码没有回调，同一金额的多笔订单
 *    在账单里根本分不清谁是谁，尾数是唯一能自动对上的锚点。
 * 2. 用户点「我已付款」之后**不立刻开通**。那只是他的一面之词，
 *    必须核对到账再放行（CLI: npm run member approve）。界面上要明确说清这一点，
 *    否则用户会以为付了钱没生效。
 *
 * 合规：不出现任何收益、荐股类表述，只描述工具能力。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { createPayOrder, confirmPayOrder, fetchPayOrder } from '@/api'
import { track } from '@/utils/track'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 默认选中的套餐 */
  defaultPlan: { type: String, default: 'year' },
  scene: { type: String, default: 'gate' },
})

const emit = defineEmits(['update:modelValue'])

const userStore = useUserStore()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const selectedPlan = ref(props.defaultPlan)
const payMethod = ref('wx')
const creating = ref(false)
const confirming = ref(false)
const order = ref(null)
const qr = ref(null)
const payerNote = ref('')
const qrBroken = ref(false)
const copied = ref(false)

let pollTimer = null

const plans = computed(() => userStore.plans.length ? userStore.plans : [])
const payMethods = computed(() => (userStore.payMethods.length ? userStore.payMethods : [
  { key: 'wx', name: '微信', qrUrl: '/pay/wx.png', supportNote: false },
  { key: 'alipay', name: '支付宝', qrUrl: '/pay/alipay.png', supportNote: true },
]))

const currentPlan = computed(() => plans.value.find((p) => p.key === selectedPlan.value) || null)
const currentMethod = computed(() => payMethods.value.find((m) => m.key === payMethod.value) || null)

/** 待核对 / 等待付款：这两种状态下要轮询，等后台核销完自动变成已开通 */
const polling = computed(() => order.value && ['pending', 'confirming'].includes(order.value.status))

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function handleCreateOrder() {
  if (!userStore.loggedIn) {
    ElMessage.warning('请先登录后再下单')
    return
  }

  creating.value = true
  qrBroken.value = false
  try {
    const result = await userStore.createOrder(selectedPlan.value, payMethod.value)
    order.value = result.order
    qr.value = result.qr
    startPolling()
  } catch (error) {
    ElMessage.error(error.response?.data?.error || '下单失败，请稍后重试')
  } finally {
    creating.value = false
  }
}

async function handleConfirmPaid() {
  if (!order.value) return

  confirming.value = true
  try {
    const result = await confirmPayOrder(order.value.orderNo, { payerNote: payerNote.value })
    order.value = result.order
    if (result.autoApproved) {
      ElMessage.success('已开通，语音播报已解锁')
      await userStore.refresh()
      visible.value = false
    } else {
      ElMessage.success('已收到，我们核对到账后会自动开通（通常几分钟内）')
    }
  } catch (error) {
    ElMessage.error(error.response?.data?.error || '提交失败，请稍后重试')
  } finally {
    confirming.value = false
  }
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(async () => {
    try {
      const data = await fetchPayOrder(order.value.orderNo)
      const next = data?.order
      if (!next) return

      const wasPaid = order.value?.status === 'paid'
      order.value = next
      if (next.status === 'paid' && !wasPaid) {
        stopPolling()
        ElMessage({
          type: 'success',
          message: `${next.planName}已开通，语音播报已解锁`,
          duration: 4000,
          showClose: true,
        })
        await userStore.refresh()
        visible.value = false
      }
      if (next.status === 'rejected' || next.status === 'expired') stopPolling()
    } catch (_) {
      // 轮询失败静默重试：这是后台任务，不能弹错误打扰正在看盘的用户
    }
  }, 5000)
}

async function copyOrderNo() {
  if (!order.value) return
  const text = order.value.orderNo
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    ElMessage.success('订单号已复制')
    setTimeout(() => { copied.value = false }, 2000)
  } catch (_) {
    ElMessage.warning(`请手动复制：${text}`)
  }
}

function backToPlans() {
  stopPolling()
  order.value = null
  qr.value = null
  payerNote.value = ''
}

watch(visible, (open) => {
  if (open) {
    track('pay_click', { scene: props.scene, target: 'qrcode' })
    if (!userStore.plans.length) userStore.loadConfig()
  } else {
    stopPolling()
  }
})

onBeforeUnmount(stopPolling)
</script>

<template>
  <el-dialog
    v-model="visible"
    width="540px"
    align-center
    class="pay-dialog"
    append-to-body
  >
    <template #header>
      <div class="pd-head">
        <h3 class="pd-title">{{ order ? '扫码付款' : '开通会员' }}</h3>
        <p class="pd-sub">付款后语音播报立即解锁，会员时长从原到期日叠加</p>
      </div>
    </template>

    <!-- 第一步：选套餐 -->
    <div v-if="!order" class="pd-body">
      <div class="pd-plans">
        <button
          v-for="plan in plans"
          :key="plan.key"
          type="button"
          class="pd-plan"
          :class="{ active: selectedPlan === plan.key }"
          @click="selectedPlan = plan.key"
        >
          <span class="pd-plan-name">{{ plan.name }}</span>
          <span class="pd-plan-price"><i>¥</i>{{ plan.price }}</span>
          <span class="pd-plan-days">{{ plan.durationDays }} 天</span>
        </button>
      </div>

      <div class="pd-methods">
        <button
          v-for="method in payMethods"
          :key="method.key"
          type="button"
          class="pd-method"
          :class="{ active: payMethod === method.key }"
          @click="payMethod = method.key"
        >
          {{ method.name }}
        </button>
      </div>

      <p class="pd-note">
        会员权益绑定<strong>账号</strong>，换电脑、清缓存都不会丢。
      </p>
    </div>

    <!-- 第二步：收款码 -->
    <div v-else class="pd-body">
      <div class="pd-qr">
        <img
          v-if="!qrBroken"
          :src="qr.url"
          :alt="`${currentMethod?.name || ''}收款码`"
          class="pd-qr-img"
          @error="qrBroken = true"
        />
        <div v-else class="pd-qr-missing">
          <p class="pd-qr-missing-title">收款码还没配置</p>
          <p class="pd-qr-missing-text">
            把你的{{ currentMethod?.name || '' }}收款码图片保存为
            <code>frontend/public/pay/{{ payMethod }}.png</code> 后重新构建即可
          </p>
        </div>
      </div>

      <div class="pd-amount">
        <span class="pd-amount-label">请付款</span>
        <span class="pd-amount-value">¥{{ order.amount.toFixed(2) }}</span>
      </div>
      <p class="pd-amount-tip">
        请按上面的<strong>精确金额</strong>付款（角分尾数是订单标识，便于我们自动核对到账）
      </p>

      <div class="pd-order">
        <span class="pd-order-label">订单号</span>
        <code class="pd-order-no">{{ order.orderNo }}</code>
        <button type="button" class="pd-copy" @click="copyOrderNo">
          {{ copied ? '已复制' : '复制' }}
        </button>
      </div>

      <p v-if="qr.supportNote" class="pd-note">
        付款时请在<strong>备注</strong>里填上订单号，核对更快。
      </p>
      <p v-else class="pd-note">
        {{ currentMethod?.name || '微信' }}个人收款码无法填备注，我们会按金额与时间核对，通常几分钟内开通。
      </p>

      <template v-if="order.status === 'pending'">
        <el-input
          v-model="payerNote"
          class="pd-note-input"
          maxlength="60"
          :placeholder="qr.supportNote ? '付款备注（选填）：你的支付宝昵称' : '付款备注（选填）：你的微信昵称'"
        />
      </template>

      <div v-else class="pd-status">
        <span class="pd-status-dot" :class="order.status" />
        {{ order.statusText }}
        <span v-if="order.status === 'confirming'" class="pd-status-hint">核对到账后会自动开通，此页面无需停留</span>
      </div>
    </div>

    <template #footer>
      <div class="pd-footer">
        <button v-if="order" type="button" class="pd-btn pd-btn-ghost" @click="backToPlans">
          重选套餐
        </button>
        <button type="button" class="pd-btn pd-btn-ghost" @click="visible = false">
          先不用
        </button>

        <button
          v-if="!order"
          type="button"
          class="pd-btn pd-btn-primary"
          :disabled="!currentPlan || creating"
          @click="handleCreateOrder"
        >
          {{ creating ? '生成中…' : `立即开通 ${currentPlan ? '¥' + currentPlan.price : ''}` }}
        </button>
        <button
          v-else-if="order.status === 'pending'"
          type="button"
          class="pd-btn pd-btn-primary"
          :disabled="confirming"
          @click="handleConfirmPaid"
        >
          {{ confirming ? '提交中…' : '我已完成付款' }}
        </button>
      </div>
      <p class="pd-disclaimer">本工具仅提供公开行情数据展示，不构成任何投资建议。</p>
    </template>
  </el-dialog>
</template>

<style scoped>
.pd-head {
  text-align: left;
}

.pd-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.pd-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

.pd-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pd-plans {
  display: flex;
  gap: 10px;
}

.pd-plan {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 14px 8px;
  border: 1.5px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-card);
  cursor: pointer;
  transition: all 0.16s ease;
}

.pd-plan:hover {
  border-color: var(--color-border-light);
}

.pd-plan.active {
  border-color: var(--color-rise);
  background: var(--color-rise-soft);
}

.pd-plan-name {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.pd-plan-price {
  font-size: 22px;
  font-weight: 800;
  line-height: 1.1;
  color: var(--color-rise);
}

.pd-plan-price i {
  font-size: 13px;
  font-style: normal;
}

.pd-plan-days {
  font-size: 11px;
  color: var(--color-text-muted);
}

.pd-methods {
  display: flex;
  gap: 10px;
}

.pd-method {
  flex: 1;
  padding: 10px;
  border: 1.5px solid var(--color-border);
  border-radius: 9px;
  background: var(--color-bg-card);
  color: var(--color-text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.16s ease;
}

.pd-method.active {
  border-color: var(--color-rise);
  background: var(--color-rise-soft);
  color: var(--color-rise);
  font-weight: 600;
}

.pd-qr {
  display: flex;
  justify-content: center;
}

.pd-qr-img {
  width: 210px;
  height: 210px;
  object-fit: contain;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: #fff;
}

.pd-qr-missing {
  width: 210px;
  padding: 20px 16px;
  border: 1px dashed var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-base);
  text-align: center;
}

.pd-qr-missing-title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.pd-qr-missing-text {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  word-break: break-all;
}

.pd-qr-missing-text code {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--color-bg-card);
  font-size: 11px;
}

.pd-amount {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
}

.pd-amount-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.pd-amount-value {
  font-size: 30px;
  font-weight: 800;
  color: var(--color-rise);
  font-variant-numeric: tabular-nums;
}

.pd-amount-tip {
  margin: -8px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.pd-amount-tip strong {
  color: var(--color-rise);
}

.pd-order {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-base);
}

.pd-order-label {
  font-size: 12px;
  color: var(--color-text-muted);
}

.pd-order-no {
  flex: 1;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--color-text-primary);
}

.pd-copy {
  padding: 3px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.pd-copy:hover {
  border-color: var(--color-rise);
  color: var(--color-rise);
}

.pd-note {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--color-bg-base);
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.pd-note strong {
  color: var(--color-rise);
}

.pd-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--color-bg-base);
  font-size: 13px;
  color: var(--color-text-primary);
}

.pd-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-muted);
}

.pd-status-dot.confirming {
  background: #f59e0b;
}

.pd-status-dot.paid {
  background: var(--color-rise);
}

.pd-status-hint {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--color-text-muted);
}

.pd-footer {
  display: flex;
  gap: 10px;
}

.pd-btn {
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

.pd-btn-ghost:hover {
  color: var(--color-text-primary);
}

.pd-btn-primary {
  border-color: transparent;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  color: #fff;
}

.pd-btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.pd-btn-primary:hover:not(:disabled) {
  filter: brightness(1.06);
}

.pd-disclaimer {
  margin: 8px 0 0;
  text-align: center;
  font-size: 11px;
  color: var(--color-text-muted);
}

@media (max-width: 560px) {
  .pd-plans {
    flex-direction: column;
  }
}
</style>
