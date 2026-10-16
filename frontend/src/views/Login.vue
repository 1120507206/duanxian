<script setup>
/**
 * 注册 / 登录。
 *
 * 转化逻辑：这张页面的存在意义不是「多个登录入口」，而是把「想要语音播报」的人
 * 变成账户。所以注册 tab 第一屏就要说清「注册即送 N 天会员」——
 * 这是免费用户唯一会主动来注册的理由，藏起来等于没有。
 *
 * 注册方式由后端的 AUTH_POLICY 决定，通过 /api/auth/config 下发：
 *   requireSms = false（当前）→ 手机号 + 密码，注册页不出现验证码输入框
 *   requireSms = true         → 先验证码，密码选填
 * 表单**必须**跟着这个开关走。如果前端自己写死「有验证码」，而后端不校验，
 * 用户会填一个没人看的码，还以为自己被骗了。
 *
 * 因此这里有一道策略就绪门（policyReady）：拿不到配置就不渲染表单，
 * 避免先渲染一套、配置回来再换一套的跳动。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const activeTab = ref('register')
const loginMode = ref('password')
const submitting = ref(false)
const sending = ref(false)
const countdown = ref(0)
const policyReady = ref(false)
let countdownTimer = null

const form = ref({
  phone: '',
  code: '',
  password: '',
  confirm: '',
})

/** 是否走短信验证码。配置拉取失败时保持 false —— 少一个字段永远比多一个填不了的字段好 */
const needSms = computed(() => userStore.requireSms)
const passwordMin = computed(() => userStore.passwordMin || 8)
const trialDays = computed(() => userStore.trialDays || 30)
const contactText = computed(() => userStore.contact || '')

const phoneValid = computed(() => /^1[3-9]\d{9}$/.test(form.value.phone))
const codeDisabled = computed(() => !phoneValid.value || countdown.value > 0 || sending.value)

const codeButtonText = computed(() => {
  if (countdown.value > 0) return `${countdown.value}s 后重发`
  if (sending.value) return '发送中…'
  return '获取验证码'
})

/** 注册按钮是否可点。密码规则与后端 AUTH_POLICY 同源，避免「前端放过、后端打回」 */
const registerReady = computed(() => {
  if (!phoneValid.value) return false
  if (needSms.value) return /^\d{6}$/.test(form.value.code)
  return form.value.password.length >= passwordMin.value && form.value.password === form.value.confirm
})

onMounted(async () => {
  // 强制拉一次：注册表单长什么样完全取决于这份策略，不能用缓存里的旧值
  await userStore.loadConfig({ force: true })
  policyReady.value = true

  // 新人礼也顺手刷一下，banner 上的天数不能是死的
  if (!userStore.ready) userStore.bootstrap()
})

function startCountdown(seconds = 60) {
  countdown.value = seconds
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

async function handleSendCode() {
  if (!phoneValid.value) {
    ElMessage.warning('请输入正确的手机号')
    return
  }

  sending.value = true
  try {
    const result = await userStore.sendCode(form.value.phone, activeTab.value === 'login' ? 'login' : 'register')
    // console 驱动 + SMS_DEBUG 时后端会回带验证码，本地联调不用真发短信
    if (result?.debugCode) {
      form.value.code = result.debugCode
      ElMessage.success(`本地调试验证码：${result.debugCode}`)
    } else {
      ElMessage.success('验证码已发送，请查收短信')
    }
    startCountdown()
  } catch (error) {
    ElMessage.error(error.response?.data?.error || '验证码发送失败，请稍后重试')
  } finally {
    sending.value = false
  }
}

function afterLogin() {
  const redirect = route.query.redirect
  const target = typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/ztlive'
  router.replace(target)
}

function validatePassword() {
  if (!form.value.password) {
    ElMessage.warning('请设置密码')
    return false
  }
  if (form.value.password.length < passwordMin.value) {
    ElMessage.warning(`密码至少 ${passwordMin.value} 位`)
    return false
  }
  return true
}

async function handleRegister() {
  if (!phoneValid.value) return ElMessage.warning('请输入正确的手机号')

  if (needSms.value) {
    if (!/^\d{6}$/.test(form.value.code)) return ElMessage.warning('请输入 6 位验证码')
    if (form.value.password && form.value.password.length < passwordMin.value) {
      return ElMessage.warning(`密码至少 ${passwordMin.value} 位`)
    }
  } else {
    if (!validatePassword()) return
    if (form.value.password !== form.value.confirm) return ElMessage.warning('两次输入的密码不一致')
  }

  submitting.value = true
  try {
    const result = await userStore.register({
      phone: form.value.phone,
      // 关掉验证码时后端不认这个字段，显式传空避免带上上一轮残留
      code: needSms.value ? form.value.code : undefined,
      // 开启验证码时密码选填（空字符串会被后端当作「不设置」）
      password: needSms.value ? (form.value.password || undefined) : form.value.password,
    })
    ElMessage({
      type: 'success',
      message: result?.message || `注册成功，已赠送 ${trialDays.value} 天会员`,
      duration: 3000,
      showClose: true,
    })
    afterLogin()
  } catch (error) {
    ElMessage.error(error.response?.data?.error || '注册失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

async function handleLoginByPassword() {
  if (!phoneValid.value) return ElMessage.warning('请输入正确的手机号')
  if (!form.value.password) return ElMessage.warning('请输入密码')

  submitting.value = true
  try {
    await userStore.loginWithPassword({ phone: form.value.phone, password: form.value.password })
    ElMessage.success('登录成功')
    afterLogin()
  } catch (error) {
    ElMessage.error(error.response?.data?.error || '登录失败')
  } finally {
    submitting.value = false
  }
}

async function handleLoginByCode() {
  if (!phoneValid.value) return ElMessage.warning('请输入正确的手机号')
  if (!/^\d{6}$/.test(form.value.code)) return ElMessage.warning('请输入 6 位验证码')

  submitting.value = true
  try {
    await userStore.loginWithCode({ phone: form.value.phone, code: form.value.code })
    ElMessage.success('登录成功')
    afterLogin()
  } catch (error) {
    ElMessage.error(error.response?.data?.error || '登录失败')
  } finally {
    submitting.value = false
  }
}

/** 忘密码提示：没有短信通道就没有自助找回，只能给客服路径，别让用户自己干瞪眼 */
function showForgotHint() {
  ElMessage.info(contactText.value ? `忘记密码请联系：${contactText.value}` : '忘记密码请联系客服重置')
}

onBeforeUnmount(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-head">
        <h1 class="auth-title">短线侠 · 涨停播报</h1>
        <p class="auth-sub">挂进通达信，有新涨停 / 炸板自动出声，不用盯屏</p>
      </div>

      <div v-if="!policyReady" class="auth-loading">
        <el-skeleton :rows="5" animated />
      </div>

      <el-tabs v-else v-model="activeTab" class="auth-tabs">
        <!-- 注册 -->
        <el-tab-pane label="注册" name="register">
          <div class="trial-banner">
            <span class="trial-badge">新人礼</span>
            <span>注册即送 <strong>{{ trialDays }} 天</strong>会员，语音播报立即可用</span>
          </div>

          <el-input
            v-model="form.phone"
            class="auth-input"
            size="large"
            maxlength="11"
            placeholder="手机号"
            clearable
          />

          <!-- 验证码只在后端要求时才出现 -->
          <div v-if="needSms" class="code-row">
            <el-input
              v-model="form.code"
              class="auth-input"
              size="large"
              maxlength="6"
              placeholder="6 位验证码"
            />
            <el-button size="large" :disabled="codeDisabled" @click="handleSendCode">
              {{ codeButtonText }}
            </el-button>
          </div>

          <el-input
            v-model="form.password"
            class="auth-input"
            size="large"
            type="password"
            :maxlength="userStore.passwordMax || 32"
            :placeholder="needSms ? `密码（选填，${passwordMin}-32 位）` : `设置密码（${passwordMin}-32 位）`"
            show-password
          />

          <el-input
            v-if="!needSms"
            v-model="form.confirm"
            class="auth-input"
            size="large"
            type="password"
            :maxlength="userStore.passwordMax || 32"
            placeholder="确认密码"
            show-password
            @keyup.enter="handleRegister"
          />

          <p class="auth-hint">
            {{ needSms
              ? '不设密码也能注册，之后用验证码登录即可'
              : '密码是唯一的登录凭据，忘记了只能联系客服重置，请记牢' }}
          </p>

          <el-button
            class="auth-submit"
            type="primary"
            size="large"
            :loading="submitting"
            :disabled="!registerReady"
            @click="handleRegister"
          >
            注册并领取 {{ trialDays }} 天会员
          </el-button>
        </el-tab-pane>

        <!-- 登录 -->
        <el-tab-pane label="登录" name="login">
          <el-input
            v-model="form.phone"
            class="auth-input"
            size="large"
            maxlength="11"
            placeholder="手机号"
            clearable
          />

          <el-radio-group v-if="needSms" v-model="loginMode" class="login-mode">
            <el-radio-button value="password">密码登录</el-radio-button>
            <el-radio-button value="code">验证码登录</el-radio-button>
          </el-radio-group>

          <div v-if="needSms && loginMode === 'code'" class="code-row">
            <el-input
              v-model="form.code"
              class="auth-input"
              size="large"
              maxlength="6"
              placeholder="6 位验证码"
            />
            <el-button size="large" :disabled="codeDisabled" @click="handleSendCode">
              {{ codeButtonText }}
            </el-button>
          </div>
          <el-input
            v-else
            v-model="form.password"
            class="auth-input"
            size="large"
            type="password"
            :maxlength="userStore.passwordMax || 32"
            placeholder="密码"
            show-password
            @keyup.enter="handleLoginByPassword"
          />

          <el-button
            class="auth-submit"
            type="primary"
            size="large"
            :loading="submitting"
            @click="needSms && loginMode === 'code' ? handleLoginByCode() : handleLoginByPassword()"
          >
            登录
          </el-button>

          <p v-if="!needSms" class="auth-forgot">
            <span @click="showForgotHint">忘记密码？</span>
          </p>
        </el-tab-pane>
      </el-tabs>

      <p class="auth-foot">
        本工具仅提供公开行情数据展示，不构成任何投资建议
      </p>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  background: var(--color-bg-deep);
}

.auth-card {
  width: 100%;
  max-width: 420px;
  padding: 32px 28px 24px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-card);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.18);
}

.auth-head {
  text-align: center;
  margin-bottom: 20px;
}

.auth-title {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.auth-sub {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.auth-loading {
  padding: 8px 0 4px;
}

.trial-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 16px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.28);
  font-size: 13px;
  color: var(--color-text-primary);
}

.trial-badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-primary, #ef4444);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}

.auth-input {
  margin-bottom: 12px;
}

.code-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.code-row .auth-input {
  flex: 1;
}

.code-row :deep(.el-button) {
  flex-shrink: 0;
  height: 40px;
}

.login-mode {
  display: flex;
  margin-bottom: 12px;
}

.auth-hint {
  margin: -4px 0 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.auth-submit {
  width: 100%;
  height: 44px;
  margin-top: 4px;
  font-size: 15px;
  font-weight: 600;
}

.auth-forgot {
  margin: 12px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.auth-forgot span {
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.auth-foot {
  margin: 18px 0 0;
  text-align: center;
  font-size: 11px;
  color: var(--color-text-secondary);
  opacity: 0.75;
}
</style>
