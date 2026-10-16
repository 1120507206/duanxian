/**
 * 运营后台的读模型。
 *
 * 与 adminService 的分工：那个文件管「谁能进后台」，这个文件管「进去之后看到什么」。
 * 全部是只读查询，不写库 —— 唯一例外是下面刻意保留的「超期订单惰性过期」，
 * 那是为了让列表里的状态与事实一致。
 *
 * 关于手机号：这里返回**完整手机号**（不同于前台 /api/auth/* 的脱敏）。
 * 理由很直接 —— 运营要靠它找到人、核对付款、处理客诉，脱敏了这活就干不了。
 * 前提是这些接口全部挂在管理员鉴权之后，且每次调用都会带 token 校验。
 */
import db from '../db/index.js'
import { PLANS, getPlan } from '../config/plans.js'
import { listPayMethods, autoApproveEnabled } from '../config/pay.js'
import { TRIAL_DAYS, AUTH_POLICY } from './accountService.js'
import { describeDriver } from './smsService.js'
import { ACTION_LABELS } from './adminService.js'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_PAGE_SIZE = 100

function nowMs() {
  return Date.now()
}

function pad(value) {
  return String(value).padStart(2, '0')
}

/** 本地时区的 YYYY-MM-DD，与 SQLite 的 date(...,'localtime') 对齐 */
function dayKey(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 生成从 since 到今天的连续日期桶，保证折线图不断档 */
function buildDayBuckets(sinceMs, untilMs = nowMs()) {
  const buckets = []
  const cursor = new Date(sinceMs)
  cursor.setHours(0, 0, 0, 0)
  while (cursor.getTime() <= untilMs) {
    buckets.push(dayKey(cursor.getTime()))
    cursor.setDate(cursor.getDate() + 1)
  }
  return buckets
}

function clampPage({ page, pageSize } = {}) {
  return {
    page: Math.max(Number(page) || 1, 1),
    pageSize: Math.min(Math.max(Number(pageSize) || 20, 1), MAX_PAGE_SIZE),
  }
}

function likeValue(keyword) {
  return `%${String(keyword || '').trim().slice(0, 40)}%`
}

/** 会员状态文案：后台列表一眼能分清「从没开过」「开过但过期了」「现在有效」 */
function membershipView(row) {
  const now = nowMs()
  const expiresAt = row.membership_expires_at || 0
  const isMember = expiresAt > now
  const everMember = expiresAt > 0
  const config = getPlan(row.membership_plan)

  return {
    isMember,
    everMember,
    expired: everMember && !isMember,
    plan: isMember ? row.membership_plan : null,
    planName: config?.name || row.membership_plan || '',
    expiresAt: expiresAt || null,
    daysLeft: isMember ? Math.ceil((expiresAt - now) / DAY_MS) : 0,
  }
}

function accountRow(row) {
  return {
    id: row.id,
    phone: row.phone,
    phoneMasked: row.phone ? `${row.phone.slice(0, 3)}****${row.phone.slice(7)}` : '',
    nickname: row.nickname || '',
    status: row.status,
    hasPassword: Boolean(row.password_hash),
    trialGranted: Boolean(row.trial_granted),
    channel: row.channel || '',
    registerIp: row.register_ip || '',
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || null,
    orderCount: Number(row.order_count || 0),
    paidAmount: Number(row.paid_amount || 0),
    deviceCount: Number(row.device_count || 0),
    ...membershipView(row),
  }
}

// ---------------------------------------------------------------- 概览

export function getOverview({ days = 14 } = {}) {
  // 顺手把超时未付款的单标记掉，避免列表里堆着「等待付款」的僵尸单
  db.prepare(`
    UPDATE payment_orders SET status = 'expired'
    WHERE status IN ('pending','confirming') AND expires_at IS NOT NULL AND expires_at < ?
  `).run(nowMs())

  const now = nowMs()
  const periodDays = Math.min(Math.max(Number(days) || 14, 1), 90)
  const since = now - periodDays * DAY_MS

  const accounts = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN membership_expires_at > ? THEN 1 ELSE 0 END) AS members,
      SUM(CASE WHEN membership_expires_at IS NOT NULL AND membership_expires_at <= ? THEN 1 ELSE 0 END) AS expired,
      SUM(CASE WHEN membership_expires_at IS NULL THEN 1 ELSE 0 END) AS never,
      SUM(trial_granted) AS trials,
      SUM(CASE WHEN status != 'active' THEN 1 ELSE 0 END) AS disabled,
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS recent
    FROM accounts
  `).get(now, now, since)

  const devices = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN last_seen_at >= ? THEN 1 ELSE 0 END) AS recent
    FROM app_users
  `).get(since)

  const orders = db.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS revenue,
      SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid,
      SUM(CASE WHEN status = 'confirming' THEN 1 ELSE 0 END) AS confirming,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
      SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired,
      COALESCE(SUM(CASE WHEN status = 'paid' AND reviewed_at >= ? THEN amount ELSE 0 END), 0) AS periodRevenue,
      SUM(CASE WHEN status = 'paid' AND reviewed_at >= ? THEN 1 ELSE 0 END) AS periodPaid
    FROM payment_orders
  `).get(since, since)

  const codes = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'unused' THEN 1 ELSE 0 END) AS unused,
      SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) AS used,
      SUM(CASE WHEN status = 'void' THEN 1 ELSE 0 END) AS void
    FROM activation_codes
  `).get()

  // ---- 趋势：按天分桶，注册 / 付费 / 收入各一条 ----
  const buckets = buildDayBuckets(since)
  const registerMap = new Map(
    db.prepare(`
      SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS d, COUNT(*) AS c
      FROM accounts WHERE created_at >= ? GROUP BY d
    `).all(since).map((row) => [row.d, row.c]),
  )
  const deviceMap = new Map(
    db.prepare(`
      SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS d, COUNT(*) AS c
      FROM app_users WHERE created_at >= ? GROUP BY d
    `).all(since).map((row) => [row.d, row.c]),
  )
  const paidRows = db.prepare(`
    SELECT date(reviewed_at / 1000, 'unixepoch', 'localtime') AS d, COUNT(*) AS c, SUM(amount) AS amount
    FROM payment_orders WHERE status = 'paid' AND reviewed_at >= ? GROUP BY d
  `).all(since)
  const paidMap = new Map(paidRows.map((row) => [row.d, { count: row.c, amount: Number(row.amount || 0) }]))

  const trend = buckets.map((date) => ({
    date,
    registers: registerMap.get(date) || 0,
    devices: deviceMap.get(date) || 0,
    paidOrders: paidMap.get(date)?.count || 0,
    revenue: Number((paidMap.get(date)?.amount || 0).toFixed(2)),
  }))

  // ---- 渠道：账户维度是「谁注册了」，设备维度是「谁被吸引了」 ----
  const channelAccounts = db.prepare(`
    SELECT
      COALESCE(NULLIF(channel, ''), '(直接访问)') AS channel,
      COUNT(*) AS accounts,
      SUM(CASE WHEN membership_expires_at > ? THEN 1 ELSE 0 END) AS members
    FROM accounts GROUP BY channel ORDER BY accounts DESC LIMIT 15
  `).all(now)

  const channelDevices = db.prepare(`
    SELECT COALESCE(NULLIF(channel, ''), '(直接访问)') AS channel, COUNT(*) AS devices
    FROM app_users GROUP BY channel ORDER BY devices DESC LIMIT 15
  `).all()

  const events = db.prepare(`
    SELECT event, COUNT(*) AS count FROM app_events
    WHERE created_at >= ? GROUP BY event ORDER BY count DESC LIMIT 20
  `).all(since)

  // 待核销队列：概览页直接能处理，不用再跳一层
  const pendingOrders = db.prepare(`
    SELECT o.order_no, o.plan, o.amount, o.pay_method, o.status, o.payer_note, o.created_at, a.phone
    FROM payment_orders o LEFT JOIN accounts a ON a.id = o.account_id
    WHERE o.status IN ('confirming','pending')
    ORDER BY CASE o.status WHEN 'confirming' THEN 0 ELSE 1 END, o.created_at DESC
    LIMIT 8
  `).all().map((row) => ({
    orderNo: row.order_no,
    phone: row.phone || '',
    plan: row.plan,
    planName: getPlan(row.plan)?.name || row.plan,
    amount: row.amount,
    payMethod: row.pay_method || '',
    status: row.status,
    payerNote: row.payer_note || '',
    createdAt: row.created_at,
  }))

  const recentAccounts = db.prepare(`
    SELECT id, phone, channel, membership_expires_at, trial_granted, created_at, last_login_at
    FROM accounts ORDER BY created_at DESC LIMIT 8
  `).all().map((row) => ({
    id: row.id,
    phone: row.phone,
    channel: row.channel || '',
    trialGranted: Boolean(row.trial_granted),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || null,
    ...membershipView(row),
  }))

  const sms = describeDriver()

  // 需要运营立刻知道的事。放在后端算，是为了 CLI 与后台页面看到同一套判断。
  const warnings = []
  const confirming = Number(orders.confirming || 0)
  if (confirming > 0) {
    warnings.push({ level: 'warn', text: `有 ${confirming} 笔订单用户已声称付款，待你核对账单后核销`, to: '/admin/orders' })
  }
  if (AUTH_POLICY.requireSmsCode && !sms.ready) {
    warnings.push({ level: 'error', text: `注册已开启短信验证码，但短信驱动仍是 ${sms.driver}，用户收不到验证码`, to: '' })
  }
  if (autoApproveEnabled()) {
    warnings.push({ level: 'warn', text: '当前开启了「用户点已付款即自动开通」，未核对账单就会放行', to: '' })
  }
  if (Number(accounts.recent || 0) === 0 && Number(devices.recent || 0) > 0) {
    warnings.push({ level: 'info', text: `近 ${periodDays} 天有访问但没有注册，检查注册页或引导入口`, to: '/admin/users' })
  }
  if (Number(codes.unused || 0) === 0) {
    warnings.push({ level: 'info', text: '没有可用的未发放激活码，卖出去会发不出码', to: '/admin/codes' })
  }

  return {
    periodDays,
    accounts: {
      total: accounts.total,
      members: Number(accounts.members || 0),
      expired: Number(accounts.expired || 0),
      never: Number(accounts.never || 0),
      trials: Number(accounts.trials || 0),
      disabled: Number(accounts.disabled || 0),
      recent: Number(accounts.recent || 0),
      conversionRate: accounts.total ? Number(((Number(accounts.members || 0) / accounts.total) * 100).toFixed(1)) : 0,
    },
    devices: {
      total: devices.total,
      recent: Number(devices.recent || 0),
    },
    orders: {
      total: orders.total,
      revenue: Number(Number(orders.revenue || 0).toFixed(2)),
      paid: Number(orders.paid || 0),
      confirming,
      pending: Number(orders.pending || 0),
      rejected: Number(orders.rejected || 0),
      expired: Number(orders.expired || 0),
      periodRevenue: Number(Number(orders.periodRevenue || 0).toFixed(2)),
      periodPaid: Number(orders.periodPaid || 0),
      avgAmount: orders.paid ? Number((Number(orders.revenue || 0) / Number(orders.paid)).toFixed(2)) : 0,
    },
    codes: {
      total: codes.total,
      unused: Number(codes.unused || 0),
      used: Number(codes.used || 0),
      void: Number(codes.void || 0),
    },
    trend,
    channelAccounts,
    channelDevices,
    events,
    pendingOrders,
    recentAccounts,
    warnings,
    health: {
      smsDriver: sms.driver,
      smsReady: sms.ready,
      requireSmsCode: AUTH_POLICY.requireSmsCode,
      autoApprove: autoApproveEnabled(),
    },
  }
}

// ---------------------------------------------------------------- 用户

const ACCOUNT_FILTERS = {
  all: '',
  member: 'a.membership_expires_at > @now',
  expired: 'a.membership_expires_at IS NOT NULL AND a.membership_expires_at <= @now',
  never: 'a.membership_expires_at IS NULL',
  trial: 'a.trial_granted = 1',
  disabled: "a.status != 'active'",
}

export function listAccounts({ keyword = '', filter = 'all', plan = '', channel = '', page, pageSize, sort = 'recent' } = {}) {
  const { page: current, pageSize: size } = clampPage({ page, pageSize })
  const where = []
  const params = { now: nowMs() }

  const filterSql = ACCOUNT_FILTERS[filter]
  if (filterSql) where.push(filterSql)

  const kw = String(keyword || '').trim()
  if (kw) {
    const digits = kw.replace(/[^\d]/g, '')
    if (digits.length >= 3) {
      where.push('a.phone LIKE @phoneLike')
      params.phoneLike = `%${digits}%`
    } else if (/^\d+$/.test(kw)) {
      where.push('a.id = @id')
      params.id = Number(kw)
    } else {
      where.push('(a.nickname LIKE @like OR a.channel LIKE @like)')
      params.like = likeValue(kw)
    }
  }

  if (plan) {
    where.push('a.membership_plan = @plan')
    params.plan = String(plan)
  }
  if (channel) {
    where.push('COALESCE(NULLIF(a.channel, \'\'), \'(直接访问)\') = @channel')
    params.channel = String(channel)
  }

  const sql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const orderBy = {
    recent: 'a.created_at DESC',
    expires: 'a.membership_expires_at DESC',
    amount: 'paid_amount DESC',
    login: 'a.last_login_at DESC',
  }[sort] || 'a.created_at DESC'

  const total = db.prepare(`SELECT COUNT(*) AS c FROM accounts a ${sql}`).get(params).c

  const rows = db.prepare(`
    SELECT a.*,
      (SELECT COUNT(*) FROM payment_orders o WHERE o.account_id = a.id) AS order_count,
      (SELECT COALESCE(SUM(o.amount), 0) FROM payment_orders o WHERE o.account_id = a.id AND o.status = 'paid') AS paid_amount,
      (SELECT COUNT(*) FROM app_users u WHERE u.account_id = a.id) AS device_count
    FROM accounts a
    ${sql}
    ORDER BY ${orderBy}
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: size, offset: (current - 1) * size })

  return { total, page: current, pageSize: size, items: rows.map(accountRow) }
}

export function getAccountDetail(accountId) {
  const row = db.prepare(`
    SELECT a.*,
      (SELECT COUNT(*) FROM payment_orders o WHERE o.account_id = a.id) AS order_count,
      (SELECT COALESCE(SUM(o.amount), 0) FROM payment_orders o WHERE o.account_id = a.id AND o.status = 'paid') AS paid_amount,
      (SELECT COUNT(*) FROM app_users u WHERE u.account_id = a.id) AS device_count
    FROM accounts a WHERE a.id = ?
  `).get(accountId)
  if (!row) return null

  const orders = db.prepare(`
    SELECT * FROM payment_orders WHERE account_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(accountId).map((o) => ({
    orderNo: o.order_no,
    plan: o.plan,
    planName: getPlan(o.plan)?.name || o.plan,
    amount: o.amount,
    payMethod: o.pay_method || '',
    status: o.status,
    payerNote: o.payer_note || '',
    remark: o.remark || '',
    reviewedBy: o.reviewed_by || '',
    createdAt: o.created_at,
    reviewedAt: o.reviewed_at || null,
  }))

  const devices = db.prepare(`
    SELECT device_id, plan, expires_at, channel, activation_count, last_code, created_at, last_seen_at
    FROM app_users WHERE account_id = ? ORDER BY last_seen_at DESC LIMIT 20
  `).all(accountId).map((d) => ({
    deviceId: d.device_id,
    plan: d.plan || '',
    expiresAt: d.expires_at || null,
    channel: d.channel || '',
    activationCount: d.activation_count || 0,
    lastCode: d.last_code || '',
    createdAt: d.created_at,
    lastSeenAt: d.last_seen_at,
  }))

  const codes = db.prepare(`
    SELECT code, plan, duration_days, channel, status, used_at, used_by_device
    FROM activation_codes WHERE used_by_account = ? ORDER BY used_at DESC LIMIT 20
  `).all(accountId).map((c) => ({
    code: c.code,
    plan: c.plan,
    durationDays: c.duration_days,
    channel: c.channel || '',
    status: c.status,
    usedAt: c.used_at || null,
    usedByDevice: c.used_by_device || '',
  }))

  const sessions = db.prepare(`
    SELECT token, device_id, ip, user_agent, created_at, last_seen_at, expires_at
    FROM sessions WHERE account_id = ? ORDER BY last_seen_at DESC LIMIT 10
  `).all(accountId).map((s) => ({
    // token 只回带前 8 位，用于区分「同一批登录」，不回传完整凭据
    tokenHint: String(s.token).slice(0, 8),
    deviceId: s.device_id || '',
    ip: s.ip || '',
    userAgent: String(s.user_agent || '').slice(0, 80),
    createdAt: s.created_at,
    lastSeenAt: s.last_seen_at,
    expiresAt: s.expires_at,
  }))

  const events = db.prepare(`
    SELECT event, path, meta, created_at FROM app_events
    WHERE account_id = ? OR device_id IN (SELECT device_id FROM app_users WHERE account_id = ?)
    ORDER BY created_at DESC LIMIT 30
  `).all(accountId, accountId).map((e) => ({
    event: e.event,
    path: e.path || '',
    meta: e.meta || '',
    createdAt: e.created_at,
  }))

  return { account: accountRow(row), orders, devices, codes, sessions, events }
}

// ---------------------------------------------------------------- 订单

export function listOrders({ status = '', keyword = '', page, pageSize } = {}) {
  const { page: current, pageSize: size } = clampPage({ page, pageSize })
  const where = []
  const params = {}

  if (status && status !== 'all') {
    where.push('o.status = @status')
    params.status = String(status)
  }

  const kw = String(keyword || '').trim()
  if (kw) {
    const digits = kw.replace(/[^\d]/g, '')
    if (digits.length >= 3) {
      where.push('(a.phone LIKE @phoneLike OR o.order_no LIKE @like OR o.payer_note LIKE @like)')
      params.phoneLike = `%${digits}%`
      params.like = likeValue(kw)
    } else {
      where.push('(o.order_no LIKE @like OR o.payer_note LIKE @like)')
      params.like = likeValue(kw)
    }
  }

  const sql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = db.prepare(`
    SELECT COUNT(*) AS c FROM payment_orders o LEFT JOIN accounts a ON a.id = o.account_id ${sql}
  `).get(params).c

  const rows = db.prepare(`
    SELECT o.*, a.phone, a.membership_expires_at
    FROM payment_orders o LEFT JOIN accounts a ON a.id = o.account_id
    ${sql}
    ORDER BY CASE o.status WHEN 'confirming' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, o.created_at DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: size, offset: (current - 1) * size })

  const STATUS_TEXT = {
    pending: '等待付款',
    confirming: '待核对',
    paid: '已开通',
    rejected: '未通过',
    expired: '已过期',
  }

  return {
    total,
    page: current,
    pageSize: size,
    counts: {
      confirming: db.prepare("SELECT COUNT(*) AS c FROM payment_orders WHERE status = 'confirming'").get().c,
      pending: db.prepare("SELECT COUNT(*) AS c FROM payment_orders WHERE status = 'pending'").get().c,
    },
    items: rows.map((row) => ({
      orderNo: row.order_no,
      accountId: row.account_id,
      phone: row.phone || '',
      plan: row.plan,
      planName: getPlan(row.plan)?.name || row.plan,
      amount: row.amount,
      payMethod: row.pay_method || '',
      status: row.status,
      statusText: STATUS_TEXT[row.status] || row.status,
      payerNote: row.payer_note || '',
      remark: row.remark || '',
      reviewedBy: row.reviewed_by || '',
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at || null,
      reviewedAt: row.reviewed_at || null,
      expiresAt: row.expires_at || null,
      memberExpiresAt: row.membership_expires_at || null,
    })),
  }
}

// ---------------------------------------------------------------- 激活码

export function listCodes({ status = '', plan = '', channel = '', keyword = '', page, pageSize } = {}) {
  const { page: current, pageSize: size } = clampPage({ page, pageSize })
  const where = []
  const params = {}

  if (status && status !== 'all') {
    where.push('c.status = @status')
    params.status = String(status)
  }
  if (plan) {
    where.push('c.plan = @plan')
    params.plan = String(plan)
  }
  if (channel) {
    where.push('c.channel = @channel')
    params.channel = String(channel)
  }
  const kw = String(keyword || '').trim()
  if (kw) {
    where.push('(c.code LIKE @like OR c.used_by_device LIKE @like OR c.batch LIKE @like)')
    params.like = likeValue(kw.toUpperCase())
  }

  const sql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = db.prepare(`SELECT COUNT(*) AS c FROM activation_codes c ${sql}`).get(params).c

  const rows = db.prepare(`
    SELECT c.*, a.phone
    FROM activation_codes c LEFT JOIN accounts a ON a.id = c.used_by_account
    ${sql}
    ORDER BY c.created_at DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: size, offset: (current - 1) * size })

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'unused' THEN 1 ELSE 0 END) AS unused,
      SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) AS used,
      SUM(CASE WHEN status = 'void' THEN 1 ELSE 0 END) AS void
    FROM activation_codes
  `).get()

  const channels = db.prepare(`
    SELECT COALESCE(NULLIF(channel, ''), '(未指定)') AS channel, COUNT(*) AS count
    FROM activation_codes GROUP BY channel ORDER BY count DESC LIMIT 30
  `).all()

  return {
    total,
    page: current,
    pageSize: size,
    stats: {
      total: stats.total,
      unused: Number(stats.unused || 0),
      used: Number(stats.used || 0),
      void: Number(stats.void || 0),
    },
    channels,
    items: rows.map((row) => ({
      code: row.code,
      plan: row.plan,
      planName: getPlan(row.plan)?.name || row.plan,
      durationDays: row.duration_days,
      channel: row.channel || '',
      batch: row.batch || '',
      status: row.status,
      usedByDevice: row.used_by_device || '',
      usedByAccountId: row.used_by_account || null,
      usedByPhone: row.phone || '',
      usedAt: row.used_at || null,
      createdAt: row.created_at,
    })),
  }
}

export function getCode(code) {
  const row = db.prepare(`
    SELECT c.*, a.phone FROM activation_codes c
    LEFT JOIN accounts a ON a.id = c.used_by_account
    WHERE c.code = ?
  `).get(String(code || '').trim().toUpperCase())
  if (!row) return null
  return {
    code: row.code,
    plan: row.plan,
    planName: getPlan(row.plan)?.name || row.plan,
    durationDays: row.duration_days,
    channel: row.channel || '',
    batch: row.batch || '',
    status: row.status,
    usedByDevice: row.used_by_device || '',
    usedByAccountId: row.used_by_account || null,
    usedByPhone: row.phone || '',
    usedAt: row.used_at || null,
    createdAt: row.created_at,
  }
}

/** 导出纯码（与 CLI export 同口径），供后台「导出/复制」用 */
export function exportCodes({ status = 'unused', plan = '', channel = '' } = {}) {
  const where = []
  const params = {}
  if (status && status !== 'all') {
    where.push('status = @status')
    params.status = String(status)
  }
  if (plan) {
    where.push('plan = @plan')
    params.plan = String(plan)
  }
  if (channel) {
    where.push('channel = @channel')
    params.channel = String(channel)
  }
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  return db.prepare(`SELECT code FROM activation_codes ${sql} ORDER BY created_at ASC`).all(params).map((r) => r.code)
}

// ---------------------------------------------------------------- 元信息

/** 后台页面渲染表单需要的一次性配置，避免前端硬编码套餐与天数 */
export function getMeta() {
  const sms = describeDriver()
  return {
    plans: Object.values(PLANS).map((plan) => ({
      key: plan.key,
      name: plan.name,
      price: plan.price,
      durationDays: plan.durationDays,
      purchasable: plan.purchasable !== false,
    })),
    payMethods: listPayMethods(),
    trialDays: TRIAL_DAYS,
    authPolicy: { ...AUTH_POLICY },
    sms: { driver: sms.driver, ready: sms.ready },
    autoApprove: autoApproveEnabled(),
    /** 审计日志的动作枚举，供后台的筛选下拉框用 */
    actions: Object.entries(ACTION_LABELS).map(([key, label]) => ({ key, label })),
  }
}
