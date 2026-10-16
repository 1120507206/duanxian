/**
 * 会员与激活码管理 CLI。
 *
 *   node src/scripts/member.js gen    --plan year --count 50 --channel tdx
 *   node src/scripts/member.js export --status unused --plan year        # 输出纯码，方便复制发放
 *   node src/scripts/member.js list   --status unused --limit 20
 *   node src/scripts/member.js stats  --days 7
 *   node src/scripts/member.js grant  --device <deviceId> --days 365     # 手动开通（不消耗激活码）
 *   node src/scripts/member.js rebind --code DXY-XXXX-XXXX --device <newDeviceId>
 *   node src/scripts/member.js void   --code DXY-XXXX-XXXX
 *
 * 为什么用 CLI 而不是后台管理接口：后台接口要多一套鉴权、多一个暴露面，
 * 而这个规模下运营动作本来就是人工执行。等你需要多人协作时再补后台不迟。
 */
import db from '../db/index.js'
import * as users from '../services/userService.js'
import * as accounts from '../services/accountService.js'
import * as pay from '../services/payService.js'
import { PLANS, isValidPlan } from '../config/plans.js'
import { describeDriver } from '../services/smsService.js'

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token.startsWith('--')) {
      const key = token.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        args[key] = true
      } else {
        args[key] = next
        i += 1
      }
    } else {
      args._.push(token)
    }
  }
  return args
}

const DAY_MS = 24 * 60 * 60 * 1000

function printHelp() {
  console.log(`
会员与激活码管理

  gen     --plan <month|quarter|year> --count <n> [--channel <码>] [--batch <批次>]
          批量生成激活码
  export  [--status unused|used|void] [--plan <plan>] [--channel <码>]
          导出纯码列表（每行一个，方便直接复制发放）
  list    [--status <状态>] [--plan <plan>] [--limit <n>]
          查看激活码明细
  stats   [--days <n>]
          运营概览：注册数、会员数、转化率、渠道分布、事件分布
  grant   --device <deviceId> [--days <n>|--plan <plan>]
          手动给某设备开通会员（不消耗激活码，用于补偿/测试）
  guser   --phone <手机号> [--days <n>|--plan <plan>]
          手动给某**账户**开通会员（账户体系下优先用这条）
  orders  [--status confirming|pending|paid|rejected] [--limit <n>]
          查看付款订单。默认列出「待核对」，就是等你对完账单要放行的那些
  approve --order <订单号> [--days <n>] [--plan <plan>]
          核销订单并开通会员 —— **确认真收到钱之后再执行**
  reject  --order <订单号> [--reason <原因>]
          拒绝订单（没收到款 / 金额对不上）
  phone   --phone <手机号>
          查某个用户的账户、会员、订单
  passwd  --phone <手机号> --password <新密码>
          重置用户密码。**当前注册不需要短信验证码，用户没有自助找回的途径**，
          有人忘密码时只能走这条。执行后该账号所有登录态失效
  rebind  --code <激活码> --device <新deviceId>
          把已使用的激活码迁移到新设备（用户换电脑/清缓存时用）
  void    --code <激活码>
          作废激活码

套餐：${Object.values(PLANS).map((p) => `${p.key}=${p.name} ¥${p.price}/${p.durationDays}天`).join('  ')}
`)
}

function cmdGen(args) {
  const plan = String(args.plan || 'year')
  if (!isValidPlan(plan)) throw new Error(`未知套餐: ${plan}（可选 ${Object.keys(PLANS).join(' / ')}）`)

  const count = Number(args.count || 10)
  const result = users.generateCodes({
    plan,
    count,
    channel: args.channel || '',
    batch: args.batch || '',
  })

  console.log(`\n已生成 ${result.codes.length} 个「${result.planName}」激活码（${result.durationDays} 天）`)
  console.log(`渠道：${result.channel || '(未指定)'}   批次：${result.batch}\n`)
  result.codes.forEach((code) => console.log(code))
  console.log('\n提示：用 export 命令导出纯码列表，或直接复制上面这些发放给用户。\n')
}

function buildCodeFilter(args) {
  const where = []
  const params = []
  if (args.status && typeof args.status === 'string') {
    where.push('status = ?')
    params.push(args.status)
  }
  if (args.plan && typeof args.plan === 'string') {
    where.push('plan = ?')
    params.push(args.plan)
  }
  if (args.channel && typeof args.channel === 'string') {
    where.push('channel = ?')
    params.push(args.channel)
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params }
}

function cmdExport(args) {
  const filter = buildCodeFilter(args)
  const rows = db.prepare(`SELECT code FROM activation_codes ${filter.sql} ORDER BY created_at ASC`).all(...filter.params)
  // 纯输出，不带任何修饰，方便 `> codes.txt` 直接落文件
  rows.forEach((row) => console.log(row.code))
  if (!rows.length) console.error('(没有符合条件的激活码)')
}

function cmdList(args) {
  const filter = buildCodeFilter(args)
  const limit = Number(args.limit || 50)
  const rows = db.prepare(`
    SELECT code, plan, duration_days, channel, batch, status, used_by_device, used_at
    FROM activation_codes ${filter.sql}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...filter.params, limit)

  if (!rows.length) {
    console.log('(没有符合条件的激活码)')
    return
  }

  console.log(`\n共显示 ${rows.length} 条：\n`)
  rows.forEach((row) => {
    const usedAt = row.used_at ? new Date(row.used_at).toLocaleString('zh-CN') : '-'
    console.log(
      `${row.code}  ${String(row.plan).padEnd(8)} ${String(row.status).padEnd(7)}`
      + ` 渠道:${String(row.channel || '-').padEnd(10)} 使用于:${String(row.used_by_device || '-').slice(0, 12).padEnd(12)} ${usedAt}`,
    )
  })
  console.log('')
}

function cmdStats(args) {
  const days = Number(args.days || 7)
  const stats = users.getStats({ sinceDays: days })

  console.log(`\n=========== 会员与增长概览（近 ${days} 天）===========\n`)
  console.log(`设备总数        ${stats.totalUsers}`)
  console.log(`当前有效会员    ${stats.members}`)
  console.log(`历史开通过会员  ${stats.everMembers}`)
  console.log(`付费转化率      ${stats.conversionRate}%   (历史开通 / 设备总数)`)
  console.log(`活跃设备        ${stats.activeDevices}   (近 ${days} 天有埋点上报)`)
  console.log(`\n激活码         总 ${stats.codes.total} / 未用 ${stats.codes.unused} / 已用 ${stats.codes.used} / 作废 ${stats.codes.void}`)

  // ---- 账户维度（注册之后的口径）----
  const acc = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN membership_expires_at > ? THEN 1 ELSE 0 END) AS members,
      SUM(trial_granted) AS trials
    FROM accounts
  `).get(Date.now())
  const newAccounts = db.prepare('SELECT COUNT(*) AS c FROM accounts WHERE created_at >= ?').get(Date.now() - days * DAY_MS).c

  console.log(`\n---------- 账户（注册用户）----------`)
  console.log(`注册总数        ${acc.total}   近 ${days} 天新增 ${newAccounts}`)
  console.log(`当前有效会员    ${acc.members}`)
  console.log(`领过新人礼      ${acc.trials}`)
  console.log(`注册转化率      ${stats.totalUsers ? Number(((acc.total / stats.totalUsers) * 100).toFixed(2)) : 0}%   (注册数 / 设备数)`)

  const orders = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS revenue,
      SUM(CASE WHEN status = 'confirming' THEN 1 ELSE 0 END) AS confirming,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
    FROM payment_orders
  `).get()

  console.log(`\n---------- 订单 ----------`)
  console.log(`总订单          ${orders.total}    已核销收入 ¥${Number(orders.revenue || 0).toFixed(2)}`)
  console.log(`待核对          ${orders.confirming}    待付款 ${orders.pending}`)
  if (orders.confirming > 0) {
    console.log(`\n  ⚠ 有 ${orders.confirming} 笔待核销，先对完账单再跑：`)
    console.log(`    npm run member orders --status confirming`)
    console.log(`    npm run member approve --order <订单号>`)
  }

  const smsInfo = describeDriver()
  if (!smsInfo.ready) {
    console.log(`\n  ⚠ 短信仍是 console 驱动（SMS_DRIVER=${smsInfo.driver}），用户收不到验证码。`)
    console.log(`    上线前必须在 backend/.env 配好 SMS_DRIVER 及对应密钥。`)
  }

  console.log('\n---------- 渠道分布（设备维度）----------')
  if (!stats.byChannel.length) {
    console.log('(暂无数据)')
  } else {
    stats.byChannel.forEach((row) => console.log(`${String(row.channel).padEnd(20)} ${row.users}`))
  }

  console.log('\n---------- 事件分布 ----------')
  if (!stats.byEvent.length) {
    console.log('(暂无数据 —— 埋点可能还没接上)')
  } else {
    stats.byEvent.forEach((row) => console.log(`${String(row.event).padEnd(20)} ${row.count}`))
  }
  console.log('')
}

function cmdGrant(args) {
  const deviceId = users.normalizeDeviceId(args.device)
  if (!deviceId) throw new Error('请用 --device 指定有效的设备 ID')

  let days
  if (args.plan && typeof args.plan === 'string') {
    if (!isValidPlan(args.plan)) throw new Error(`未知套餐: ${args.plan}`)
    days = PLANS[args.plan].durationDays
  } else {
    days = Number(args.days || 30)
  }

  const now = Date.now()
  const existing = db.prepare('SELECT * FROM app_users WHERE device_id = ?').get(deviceId)
  const base = Math.max(existing?.expires_at || 0, now)
  const expiresAt = base + days * DAY_MS

  if (!existing) {
    db.prepare(`
      INSERT INTO app_users (device_id, plan, expires_at, channel, activation_count, created_at, last_seen_at)
      VALUES (?, ?, ?, 'manual', 0, ?, ?)
    `).run(deviceId, args.plan || 'manual', expiresAt, now, now)
  } else {
    db.prepare('UPDATE app_users SET plan = ?, expires_at = ? WHERE device_id = ?')
      .run(args.plan || existing.plan || 'manual', expiresAt, deviceId)
  }

  console.log(`\n已为设备 ${deviceId} 开通 ${days} 天，到期：${new Date(expiresAt).toLocaleString('zh-CN')}\n`)
}

function cmdRebind(args) {
  const result = users.rebindCode({ code: args.code, deviceId: args.device })
  if (!result.ok) {
    console.error(`迁移失败：${result.error}`)
    process.exitCode = 1
    return
  }
  console.log(`\n已把激活码从 ${result.from || '(未知)'} 迁移到 ${result.to}`)
  console.log(`到期时间：${new Date(result.expiresAt).toLocaleString('zh-CN')}\n`)
}

function cmdVoid(args) {
  const result = users.voidCode({ code: args.code })
  if (!result.ok) {
    console.error(`作废失败：${result.error}`)
    process.exitCode = 1
    return
  }
  console.log(`已作废 ${result.code}`)
}

/** 给账户开通/续期（账户体系下的主力命令） */
function cmdGrantUser(args) {
  const phone = String(args.phone || '').replace(/[^\d]/g, '')
  const row = db.prepare('SELECT * FROM accounts WHERE phone = ?').get(phone)
  if (!row) throw new Error(`手机号 ${phone} 尚未注册`)

  let days
  if (args.plan && typeof args.plan === 'string') {
    if (!isValidPlan(args.plan)) throw new Error(`未知套餐: ${args.plan}`)
    days = PLANS[args.plan].durationDays
  } else {
    days = Number(args.days || 30)
  }

  const result = accounts.grantMembership({
    accountId: row.id,
    plan: args.plan || null,
    days,
    source: 'cli_grant',
  })
  if (!result.ok) throw new Error(result.error)

  console.log(`\n已为 ${phone} 开通 ${days} 天`)
  console.log(`到期：${new Date(result.expiresAt).toLocaleString('zh-CN')}${result.renewed ? '（在原到期日基础上叠加）' : ''}\n`)
}

/** 订单列表。默认看「待核对」—— 这是每天真正要处理的队列 */
function cmdOrders(args) {
  const status = typeof args.status === 'string' ? args.status : 'confirming'
  const limit = Number(args.limit || 50)
  const rows = db.prepare(`
    SELECT o.*, a.phone
    FROM payment_orders o LEFT JOIN accounts a ON a.id = o.account_id
    WHERE o.status = ?
    ORDER BY o.created_at DESC LIMIT ?
  `).all(status, limit)

  console.log(`\n订单（状态=${status}，最多 ${limit} 条）\n`)
  if (!rows.length) {
    console.log('(没有符合条件的订单)\n')
    return
  }

  rows.forEach((row) => {
    const time = new Date(row.created_at).toLocaleString('zh-CN')
    console.log(
      `${row.order_no}  ¥${row.amount.toFixed(2)}  ${String(row.plan).padEnd(8)}`
      + ` ${String(row.pay_method || '-').padEnd(7)} ${String(row.phone || '(无账户)').padEnd(12)} ${time}`,
    )
    if (row.payer_note) console.log(`    付款备注：${row.payer_note}`)
  })
  console.log(`\n核销：npm run member approve --order <订单号>`)
  console.log(`拒绝：npm run member reject  --order <订单号> --reason "未收到该笔款项"\n`)
}

function cmdApprove(args) {
  const orderNo = String(args.order || '').trim().toUpperCase()
  if (!orderNo) throw new Error('请用 --order 指定订单号')

  const result = pay.approveOrder({
    orderNo,
    by: 'cli',
    days: args.days ? Number(args.days) : undefined,
    plan: typeof args.plan === 'string' ? args.plan : undefined,
  })
  if (!result.ok) {
    console.error(`核销失败：${result.error}`)
    process.exitCode = 1
    return
  }

  console.log(`\n已核销 ${orderNo}`)
  if (result.status) {
    console.log(`账户：${result.status.phoneMasked}`)
    console.log(`到期：${new Date(result.expiresAt).toLocaleString('zh-CN')}`)
  } else {
    console.log('(该订单没有绑定账户，未能开通会员)')
  }
  console.log('')
}

function cmdReject(args) {
  const orderNo = String(args.order || '').trim().toUpperCase()
  if (!orderNo) throw new Error('请用 --order 指定订单号')

  const result = pay.rejectOrder({ orderNo, by: 'cli', reason: args.reason || '未收到款项' })
  if (!result.ok) {
    console.error(`拒绝失败：${result.error}`)
    process.exitCode = 1
    return
  }
  console.log(`\n已拒绝 ${orderNo}${args.reason ? `（${args.reason}）` : ''}\n`)
}

/** 查某个用户：账户 + 会员 + 订单，客服场景最常用 */
function cmdPhone(args) {
  const phone = String(args.phone || '').replace(/[^\d]/g, '')
  const row = db.prepare('SELECT * FROM accounts WHERE phone = ?').get(phone)
  if (!row) {
    console.log(`\n${phone} 尚未注册\n`)
    return
  }

  const status = accounts.getPublicAccount(row.id)
  console.log(`\n账户 #${row.id}   ${status.phoneMasked}`)
  console.log(`注册时间  ${new Date(row.created_at).toLocaleString('zh-CN')}   渠道 ${row.channel || '(直接访问)'}`)
  console.log(`会员      ${status.isMember ? `${status.planName}，剩 ${status.daysLeft} 天，${new Date(status.expiresAt).toLocaleDateString('zh-CN')} 到期` : '非会员'}`)
  console.log(`新人礼    ${status.trialGranted ? '已领取' : '未领取'}   密码 ${status.hasPassword ? '已设置' : '未设置'}`)

  const orders = pay.listMyOrders(row.id, 10)
  console.log('\n订单：')
  if (!orders.length) {
    console.log('  (无)')
  } else {
    orders.forEach((o) => console.log(`  ${o.orderNo}  ¥${o.amount.toFixed(2)}  ${o.planName}  ${o.statusText}`))
  }
  console.log('')
}

/**
 * 按手机号重置密码。
 *
 * 为什么必须有这条：注册现在不需要短信验证码，没有短信通道也就没有
 * 「验证码找回密码」。一个付过钱的用户忘密码就登不上 —— 这是最亏的流失，
 * 所以留一条人工通道。走 CLI 而不是 HTTP 接口，是因为一个不需要登录、
 * 又不需要验证码的「重置任意账号密码」接口，本身就是撞库工具。
 */
function cmdPasswd(args) {
  const phone = String(args.phone || '').replace(/[^\d]/g, '')
  const password = String(args.password || '')
  if (!phone) throw new Error('请用 --phone 指定手机号')
  if (!password) throw new Error('请用 --password 指定新密码')

  const result = accounts.resetPasswordByPhone({ phone, password })
  if (!result.ok) {
    console.error(`\n重置失败：${result.error}\n`)
    process.exitCode = 1
    return
  }

  console.log(`\n已重置 ${result.account.phoneMasked} 的密码（该账号所有登录态已失效，需重新登录）\n`)
}

const commands = {
  gen: cmdGen,
  export: cmdExport,
  list: cmdList,
  stats: cmdStats,
  grant: cmdGrant,
  guser: cmdGrantUser,
  orders: cmdOrders,
  approve: cmdApprove,
  reject: cmdReject,
  phone: cmdPhone,
  passwd: cmdPasswd,
  rebind: cmdRebind,
  void: cmdVoid,
}

const args = parseArgs(process.argv.slice(2))
const command = args._[0] || 'help'

if (command === 'help' || !commands[command]) {
  printHelp()
  process.exit(command === 'help' ? 0 : 1)
}

try {
  commands[command](args)
} catch (error) {
  console.error(`执行失败：${error.message}`)
  process.exitCode = 1
}
