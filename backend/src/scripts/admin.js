/**
 * 后台管理员 CLI。
 *
 *   node src/scripts/admin.js init   --username admin --password xxxx
 *   node src/scripts/admin.js list
 *   node src/scripts/admin.js disable --username admin
 *   node src/scripts/admin.js logs   [--limit 30]
 *
 * 为什么管理员账号只能从这里创建，不做一个「首次访问自动初始化」的网页流程：
 * 一个能自举的后台登录页，意味着任何先到的人都能抢注管理员 —— 而这个后台
 * 能重置所有用户密码、能改所有人的会员到期时间。所以第一把钥匙必须握在
 * 能登服务器的人手里，这是刻意的设计，不是没做完。
 */
import db from '../db/index.js'
import * as admin from '../services/adminService.js'
import { ACTION_LABELS } from '../services/adminService.js'

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

function fmtTime(ms) {
  return ms ? new Date(ms).toLocaleString('zh-CN') : '-'
}

function printHelp() {
  console.log(`
运营后台管理员管理

  init    --username <用户名> --password <密码> [--name <显示名>]
          创建管理员；同名已存在则重置其密码（忘掉后台密码时的恢复路径）。
          重置会立刻踢掉该管理员的全部在线会话
  list
          查看所有管理员及其最后登录时间
  disable --username <用户名>      停用管理员（连带踢掉其所有会话）
  enable  --username <用户名>      重新启用
  logs    [--limit <n>] [--action <动作>]
          查看后台操作审计日志

后台地址：https://你的域名/admin
首次使用顺序：先跑 init，再用刚设的账号密码登录。
`)
}

function cmdInit(args) {
  if (!args.username) throw new Error('请用 --username 指定用户名')
  if (!args.password) throw new Error('请用 --password 指定密码（至少 8 位）')

  const result = admin.createAdmin({
    username: args.username,
    password: args.password,
    displayName: typeof args.name === 'string' ? args.name : '',
  })
  if (!result.ok) throw new Error(result.error)

  console.log('')
  console.log(result.created ? `已创建管理员：${result.username}` : `已重置管理员密码：${result.username}`)
  console.log(`后台地址：/admin   登录名：${result.username}`)
  if (!result.created) console.log('该管理员的在线会话已全部失效，需重新登录。')
  console.log('')
  console.log('安全提示：')
  console.log('  1. 密码只存在服务端的 scrypt 哈希里，忘了只能用本命令重置，请自行保存好。')
  console.log('  2. 后台建议只在内网或加一层 IP 白名单访问，它比前台敏感得多。')
  console.log('')
}

function cmdList() {
  const rows = admin.listAdmins()
  if (!rows.length) {
    console.log('\n还没有管理员。先执行：\n  npm run admin init --username admin --password 你的密码\n')
    return
  }
  console.log(`\n共 ${rows.length} 个管理员：\n`)
  rows.forEach((row) => {
    console.log(
      `#${String(row.id).padEnd(3)} ${String(row.username).padEnd(16)} ${String(row.status).padEnd(9)}`
      + ` 最后登录 ${fmtTime(row.lastLoginAt)}  ${row.lastLoginIp || ''}`,
    )
  })
  console.log('')
}

function cmdDisable(args, enabled) {
  const username = String(args.username || '').trim()
  if (!username) throw new Error('请用 --username 指定用户名')

  const row = db.prepare('SELECT id, username FROM admin_users WHERE username = ?').get(username)
  if (!row) throw new Error(`管理员 ${username} 不存在`)

  const result = admin.setAdminStatus({ adminId: row.id, status: enabled ? 'active' : 'disabled' })
  if (!result.ok) throw new Error(result.error)
  console.log(`\n已${enabled ? '启用' : '停用'}管理员 ${username}${enabled ? '' : '（其所有在线会话已失效）'}\n`)
}

function cmdLogs(args) {
  const limit = Number(args.limit || 30)
  const result = admin.listLogs({ page: 1, pageSize: Math.min(limit, 200), action: typeof args.action === 'string' ? args.action : '' })

  console.log(`\n后台操作日志（最近 ${result.items.length} / 共 ${result.total} 条）\n`)
  if (!result.items.length) {
    console.log('(暂无记录)\n')
    return
  }

  result.items.forEach((item) => {
    const label = ACTION_LABELS[item.action] || item.action
    console.log(`${fmtTime(item.createdAt)}  ${String(item.adminName).padEnd(12)} ${String(label).padEnd(14)} ${item.targetType}:${item.targetId}`)
    if (item.detail) console.log(`    ${item.detail}`)
  })
  console.log('')
}

const commands = {
  init: cmdInit,
  passwd: cmdInit,
  list: cmdList,
  disable: (args) => cmdDisable(args, false),
  enable: (args) => cmdDisable(args, true),
  logs: cmdLogs,
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
