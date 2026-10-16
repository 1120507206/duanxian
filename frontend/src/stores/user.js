import { defineStore } from 'pinia'
import {
  createUserSession,
  activateMembership,
  fetchUserStatus,
  sendSmsCode,
  registerAccount,
  loginByPassword,
  loginByCode,
  logoutAccount,
  fetchMe,
  fetchMemberConfig,
  createPayOrder,
} from '@/api'
import { getDeviceId, getChannel, captureChannel } from '@/utils/deviceId'
import { getSessionToken, setSessionToken, clearSessionToken } from '@/utils/sessionToken'
import { track } from '@/utils/track'

/**
 * 用户状态：账户（人）+ 设备（客户端）双维度。
 *
 * 权益有三条来源，分工明确：
 * - `/api/user/session`：页面加载时调一次，负责**设备建档**并落渠道（首次归因）。
 * - `/api/auth/me`：带 token 时返回账户权益，登录后立即可用。
 * - `/api/ztlive` 响应里的 `entitlements`：每 3 秒随行情回来，负责**持续校准**。
 *
 * 第三条存在的原因：用户在另一个标签页完成付款、或者你在后台手动给他续期，
 * 本页应该几秒内自动解锁，而不是非要刷新。行情轮询白送的通道正好干这件事，零额外请求。
 *
 * 权益永远以后端为准 —— 前端 state 只是展示用的镜像。
 */
export const useUserStore = defineStore('user', {
  state: () => ({
    deviceId: '',
    channel: '',
    // ---- 账户 ----
    token: getSessionToken(),
    loggedIn: false,
    account: null,
    // ---- 权益 ----
    plan: null,
    planName: null,
    isMember: false,
    expiresAt: null,
    daysLeft: 0,
    // ---- 配置 ----
    plans: [],
    payMethods: [],
    trialDays: 30,
    contact: '',
    /** 注册是否需要短信验证码。默认 false，与后端 AUTH_POLICY 保持一致，以 /api/auth/config 为准 */
    requireSms: false,
    passwordMin: 8,
    passwordMax: 32,
    /** 短信通道是否已配好（console 驱动下为 false，意味着验证码发不到用户手里） */
    smsReady: false,
    configLoaded: false,
    ready: false,
    loading: false,
    error: '',
  }),

  getters: {
    /** 语音播报是付费点：免费看表，付费出声 */
    canUseVoice: (state) => state.isMember,
    /** 会员到期前 7 天给出续费提示 */
    expiringSoon: (state) => state.isMember && state.daysLeft > 0 && state.daysLeft <= 7,
    expiresAtText: (state) => {
      if (!state.expiresAt) return ''
      const date = new Date(state.expiresAt)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    },
    phoneMasked: (state) => state.account?.phoneMasked || '',
  },

  actions: {
    /** 合并后端返回的权益字段 */
    applyStatus(status) {
      if (!status || typeof status !== 'object') return
      this.plan = status.plan || null
      this.planName = status.planName || null
      this.isMember = Boolean(status.isMember)
      this.expiresAt = status.expiresAt || null
      this.daysLeft = Number(status.daysLeft) || 0
    },

    /**
     * 由行情轮询带回来的权益做校准。
     * 只在真正变化时赋值，避免每 3 秒触发一次无意义的响应式更新。
     */
    syncEntitlements(entitlements) {
      if (!entitlements || typeof entitlements !== 'object') return
      const nextMember = Boolean(entitlements.isMember)
      const nextExpires = entitlements.expiresAt || null
      if (nextMember === this.isMember && nextExpires === this.expiresAt) return

      this.isMember = nextMember
      this.expiresAt = nextExpires
      this.daysLeft = Number(entitlements.daysLeft) || 0
      this.plan = entitlements.plan || null
      this.ready = true
    },

    /** 页面挂载时调用：设备建档 + 拉取登录态与权益 */
    async bootstrap({ force = false } = {}) {
      if (this.ready && !force) return
      if (this.loading) return

      this.loading = true
      this.error = ''
      this.deviceId = getDeviceId()
      // 先把 URL 上的渠道参数落盘（首次归因），再读取。
      // 顺序不能反：captureChannel 只在「本地还没有渠道」时写入。
      captureChannel()
      this.channel = getChannel()
      this.token = getSessionToken()

      try {
        // 设备建档（匿名也要能统计渠道）
        await createUserSession({ deviceId: this.deviceId, channel: this.channel })

        // 登录态与账户权益
        const me = await fetchMe(this.deviceId)
        this.loggedIn = Boolean(me?.loggedIn)
        this.account = me?.account || null
        this.applyStatus(me?.entitlement || {})
        this.ready = true
      } catch (error) {
        // 建档失败不阻塞页面：行情照常看，只是语音按非会员处理。
        // 让后端故障演变成「白屏」是比暂时收不到钱更糟的事。
        this.error = error.response?.data?.error || '用户状态获取失败'
        this.ready = true
      } finally {
        this.loading = false
      }
    },

    /**
     * 一次性配置：套餐、收款方式、新人礼天数、认证策略。
     * @param {{force?: boolean}} [options] force 用于登录页等「必须拿到才能正确渲染表单」的场景
     */
    async loadConfig({ force = false } = {}) {
      if (this.configLoaded && !force) return
      try {
        const data = await fetchMemberConfig()
        this.plans = data?.plans || []
        this.payMethods = data?.payMethods || []
        this.trialDays = Number(data?.trialDays) || 30
        this.contact = data?.contact || ''
        this.requireSms = Boolean(data?.requireSms)
        this.passwordMin = Number(data?.passwordMin) || 8
        this.passwordMax = Number(data?.passwordMax) || 32
        this.smsReady = Boolean(data?.smsReady)
        this.configLoaded = true
      } catch (_) {
        // 配置拉不到不影响主流程，只是收银台会缺信息。
        // 注意 requireSms 保持默认 false：注册表单少一个字段永远比多一个填不了的字段好。
      }
    },

    /** 登录后统一收尾：存 token、写状态、埋点 */
    finishAuth(result) {
      this.token = result.token
      setSessionToken(result.token)
      this.account = result.account || null
      this.loggedIn = true
      this.applyStatus(result.account || {})
      this.ready = true
    },

    async sendCode(phone, purpose = 'register') {
      return sendSmsCode({ phone, purpose, deviceId: getDeviceId() })
    },

    async register({ phone, code, password }) {
      const result = await registerAccount({
        phone,
        code,
        password,
        deviceId: getDeviceId(),
        channel: getChannel(),
      })
      this.finishAuth(result)
      track('register', { trial: Boolean(result.trial) })
      return result
    },

    async loginWithPassword({ phone, password }) {
      const result = await loginByPassword({ phone, password, deviceId: getDeviceId() })
      this.finishAuth(result)
      track('login', { method: 'password' })
      return result
    },

    async loginWithCode({ phone, code }) {
      const result = await loginByCode({ phone, code, deviceId: getDeviceId() })
      this.finishAuth(result)
      track('login', { method: 'code' })
      return result
    },

    async logout() {
      try {
        await logoutAccount()
      } catch (_) {
        // 退出失败也要清本地：用户点了退出，本地状态必须一致
      }
      this.token = ''
      this.account = null
      this.loggedIn = false
      clearSessionToken()
      // 退出后重新拉一次：设备维度可能还残留着老的激活码权益
      await this.refresh()
      track('logout')
    },

    /** 静默刷新权益（激活成功后、或用户点「刷新状态」时用） */
    async refresh() {
      this.deviceId = this.deviceId || getDeviceId()
      try {
        const me = await fetchMe(this.deviceId)
        this.loggedIn = Boolean(me?.loggedIn)
        this.account = me?.account || null
        this.applyStatus(me?.entitlement || {})
        this.ready = true
        return me
      } catch (error) {
        return null
      }
    },

    /** 核销激活码（渠道商、线下售卖场景仍用得上） */
    async redeem(code) {
      const result = await activateMembership({ deviceId: getDeviceId(), code })
      if (result.status) this.applyStatus(result.status)
      await this.refresh()
      track('activate_success', { plan: result.plan, renewed: Boolean(result.renewed) })
      return result
    },

    /** 下单：返回订单与收款码信息，由调用方展示 */
    async createOrder(plan, payMethod = 'wx') {
      const result = await createPayOrder({ plan, payMethod, deviceId: getDeviceId() })
      track('order_create', { plan, payMethod })
      return result
    },
  },
})
