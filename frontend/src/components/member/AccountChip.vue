<script setup>
/**
 * 顶栏的账户入口。
 *
 * 未登录显示「登录 / 注册」，登录后显示脱敏手机号 + 会员剩余天数 + 会员操作按钮。
 * 剩余天数在这里常驻是有意的：续费提醒不能只靠弹窗 —— 用户天天看得到，
 * 快到期时自己会去续，比临期弹一次窗的转化高得多。
 *
 * 「开通 / 续费」按钮是付费的常驻入口。这一点必须常驻的原因：
 * 注册即送试用，试用期间就是会员态，语音门禁不再弹出 —— 如果没有这个按钮，
 * 试用中的用户会把站内翻遍也找不到付款的地方。
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { MEMBER_CONFIG } from '@/config/member'
import PayDialog from './PayDialog.vue'

const router = useRouter()
const userStore = useUserStore()

const payVisible = ref(false)

const membershipText = computed(() => {
  if (!userStore.isMember) return '未开通'
  if (userStore.daysLeft <= 0) return '已过期'
  return `会员 ${userStore.daysLeft} 天`
})

const expiring = computed(() => userStore.expiringSoon)

/** 会员态（含试用）显示「续费」，非会员显示「开通会员」 */
const payButtonText = computed(() => (userStore.isMember ? '续费' : '开通会员'))

/** 会员入口总开关，与 config/member.js 的 enabled 保持一致 */
const showPayEntry = computed(() => Boolean(MEMBER_CONFIG.enabled))

function goAuth() {
  router.push('/login')
}

function openPay() {
  if (!userStore.loggedIn) {
    router.push('/login')
    return
  }
  payVisible.value = true
}

async function handleLogout() {
  await userStore.logout()
}
</script>

<template>
  <div class="account-chip">
    <button v-if="!userStore.loggedIn" class="auth-btn" type="button" @click="goAuth">
      登录 / 注册
    </button>

    <div v-else class="account-box">
      <div class="account-info">
        <span class="account-phone">{{ userStore.phoneMasked }}</span>
        <span class="account-plan" :class="{ expiring, none: !userStore.isMember }">
          {{ membershipText }}
        </span>
      </div>
      <button
        v-if="showPayEntry"
        class="pay-btn"
        type="button"
        :title="payButtonText"
        @click="openPay"
      >
        {{ payButtonText }}
      </button>
      <button class="logout-btn" type="button" title="退出登录" @click="handleLogout">退出</button>
    </div>

    <!-- 收款码付款：独立弹窗，与账户信息互不干扰 -->
    <PayDialog v-model="payVisible" scene="account_chip" />
  </div>
</template>

<style scoped>
.account-chip {
  display: flex;
  align-items: center;
}

.auth-btn {
  padding: 6px 14px;
  border: 1px solid var(--color-primary, #ef4444);
  border-radius: 999px;
  background: transparent;
  color: var(--color-primary, #ef4444);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;
}

.auth-btn:hover {
  background: var(--color-primary, #ef4444);
  color: #fff;
}

.account-box {
  display: flex;
  align-items: center;
  gap: 10px;
}

.account-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.25;
}

.account-phone {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.account-plan {
  font-size: 11px;
  color: var(--color-text-secondary);
}

/* 到期前 7 天：用主色提示，但不用 warning 黄 —— 主站是红系配色，黄会显得脏 */
.account-plan.expiring {
  color: var(--color-primary, #ef4444);
  font-weight: 600;
}

.account-plan.none {
  opacity: 0.7;
}

/* 付费入口：主色实心，是顶栏里唯一强调色的按钮 */
.pay-btn {
  padding: 5px 12px;
  border: none;
  border-radius: 6px;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: filter 0.18s ease, transform 0.18s ease;
}

.pay-btn:hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
}

.logout-btn {
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.logout-btn:hover {
  border-color: var(--color-primary, #ef4444);
  color: var(--color-primary, #ef4444);
}

@media (max-width: 640px) {
  .account-phone {
    display: none;
  }
}
</style>
