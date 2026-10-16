import { defineStore } from 'pinia'
import {
  adminLogin,
  adminLogout,
  adminMe,
  fetchAdminMeta,
  adminErrorMessage,
  adminErrorCode,
} from '@/api/admin'
import { getAdminToken, setAdminToken, clearAdminToken } from '@/utils/adminToken'

/**
 * 后台会话状态。
 *
 * 与前台 user store 是两套完全独立的东西，不要合并 ——
 * 同一个浏览器同时登录用户账号和后台账号是运营的日常。
 *
 * 会话是否有效**永远以服务端为准**：本地只存 token，不存"已登录"这个结论。
 * 页面进入后台时都会调一次 `/me` 复核，因为 token 可能已被服务端作废
 * （改密码、停用账号、12 小时过期）。
 */
export const useAdminStore = defineStore('admin', {
  state: () => ({
    token: getAdminToken(),
    admin: null,
    expiresAt: null,
    /** 是否已跟服务端复核过会话 */
    verified: false,
    /** 会话复核中，避免路由守卫与页面重复请求 */
    verifying: false,
    /** 后台未初始化时单独标记，登录页据此给出「去服务器执行 init」的引导 */
    notInitialized: false,
    meta: null,
    metaLoaded: false,
  }),

  getters: {
    isLoggedIn: (state) => Boolean(state.admin),
    adminName: (state) => state.admin?.displayName || state.admin?.username || '',
    planOptions: (state) => state.meta?.plans || [],
    trialDays: (state) => Number(state.meta?.trialDays) || 30,
  },

  actions: {
    async login({ username, password }) {
      const result = await adminLogin({ username, password })
      this.token = result.token
      setAdminToken(result.token)
      this.admin = result.admin
      this.expiresAt = result.expiresAt
      this.verified = true
      this.notInitialized = false
      return result
    },

    /**
     * 复核会话。返回 true 表示可以继续留在后台。
     * 失败时把本地状态清干净 —— 留着一个失效的 token 只会让后续每个请求都 401。
     */
    async ensureSession({ force = false } = {}) {
      if (this.verified && !force) return true
      if (this.verifying) return Boolean(this.admin)

      const token = getAdminToken()
      this.token = token
      if (!token) {
        this.admin = null
        this.verified = true
        return false
      }

      this.verifying = true
      try {
        const result = await adminMe()
        this.admin = result.admin
        this.expiresAt = result.expiresAt
        this.verified = true
        return true
      } catch (error) {
        this.admin = null
        this.verified = true
        clearAdminToken()
        this.token = ''
        return false
      } finally {
        this.verifying = false
      }
    },

    async logout() {
      try {
        await adminLogout()
      } catch (_) {
        // 服务端可能已经失效；本地该清还是要清
      }
      this.reset()
    },

    reset() {
      this.token = ''
      this.admin = null
      this.expiresAt = null
      this.verified = false
      clearAdminToken()
    },

    /** 套餐、收款方式、短信驱动等配置，后台的各个下拉框都靠它 */
    async loadMeta({ force = false } = {}) {
      if (this.metaLoaded && !force) return this.meta
      try {
        this.meta = await fetchAdminMeta()
        this.metaLoaded = true
      } catch (_) {
        // 配置拉不到不阻塞页面，只是选项会缺
      }
      return this.meta
    },

    /** 登录页要把服务端错误码转成人话，这里统一处理一次 */
    describeError(error) {
      const code = adminErrorCode(error)
      if (code === 'ADMIN_NOT_INITIALIZED') this.notInitialized = true
      return adminErrorMessage(error, '登录失败，请稍后重试')
    },
  },
})
