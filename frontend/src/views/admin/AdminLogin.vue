<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Lock, User } from '@element-plus/icons-vue'
import { useAdminStore } from '@/stores/admin'

/**
 * 后台登录页。
 *
 * 管理员账号只能从服务器端创建。一个能自举的后台登录页，意味着任何先到的人
 * 都能抢注管理员 —— 而这个后台能重置所有用户密码、能改所有人的会员到期时间。
 * 所以第一把钥匙只握在能登服务器的人手里，登录页不提供任何创建入口。
 */
const route = useRoute()
const router = useRouter()
const adminStore = useAdminStore()

const form = ref({ username: '', password: '' })
const submitting = ref(false)
const errorText = ref('')

async function submit() {
  if (!form.value.username.trim() || !form.value.password) {
    errorText.value = '请填写用户名和密码'
    return
  }

  submitting.value = true
  errorText.value = ''

  try {
    await adminStore.login({
      username: form.value.username.trim(),
      password: form.value.password,
    })
    ElMessage.success('登录成功')

    const redirect = String(route.query.redirect || '/admin/overview')
    router.replace(redirect.startsWith('/admin') ? redirect : '/admin/overview')
  } catch (error) {
    errorText.value = adminStore.describeError(error)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="admin-login">
    <div class="login-card">
      <div class="login-brand">
        <div class="brand-mark">DX</div>
        <div class="brand-text">
          <h1>短线侠 · 运营后台</h1>
          <p>会员、订单与激活码管理</p>
        </div>
      </div>

      <form class="login-form" @submit.prevent="submit">
        <label class="field">
          <span class="field-label">用户名</span>
          <el-input
            v-model="form.username"
            size="large"
            placeholder="管理员用户名"
            autocomplete="username"
            :prefix-icon="User"
          />
        </label>

        <label class="field">
          <span class="field-label">密码</span>
          <el-input
            v-model="form.password"
            type="password"
            size="large"
            placeholder="密码"
            show-password
            autocomplete="current-password"
            :prefix-icon="Lock"
            @keyup.enter="submit"
          />
        </label>

        <p v-if="errorText" class="error-line">{{ errorText }}</p>

        <button type="submit" class="submit-btn" :disabled="submitting">
          {{ submitting ? '登录中…' : '登录后台' }}
        </button>
      </form>

      <div class="login-footer">
        <span class="hint">连续 5 次输错会锁定 15 分钟</span>
        <a href="/" class="back-link">返回站点</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(1000px 500px at 50% -10%, var(--color-rise-soft), transparent 70%),
    var(--color-bg-deep);
}

.login-card {
  width: 100%;
  max-width: 420px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card-hover);
  padding: 32px 30px 24px;
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 26px;
}

.brand-mark {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  color: #fff;
  font-weight: 900;
  font-size: 17px;
  letter-spacing: -0.5px;
  box-shadow: 0 6px 16px rgba(239, 68, 68, 0.28);
  flex-shrink: 0;
}

.brand-text h1 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--color-text-primary);
  letter-spacing: 0.02em;
}

.brand-text p {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  letter-spacing: 0.03em;
}

.error-line {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--color-rise);
  background: var(--color-rise-soft);
  border-radius: var(--radius-sm);
  padding: 9px 11px;
}

.submit-btn {
  margin-top: 4px;
  height: 42px;
  border: none;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: opacity var(--transition-fast), transform var(--transition-fast);
}

.submit-btn:hover:not(:disabled) { transform: translateY(-1px); }
.submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.login-footer {
  margin-top: 22px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hint,
.back-link {
  font-size: 11.5px;
  color: var(--color-text-muted);
}

.back-link {
  text-decoration: none;
  transition: color var(--transition-fast);
}

.back-link:hover { color: var(--color-rise); }
</style>
