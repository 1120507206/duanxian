import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const dataDir = mkdtempSync(path.join(tmpdir(), 'duanxian-ent-'))
process.env.DB_PATH = path.join(dataDir, 'test.db')

const { default: db } = await import('../../backend/src/db/index.js')
const accounts = await import('../../backend/src/services/accountService.js')

let phoneSeq = 0
function seedAccount() {
  phoneSeq += 1
  const now = Date.now()
  const phone = `1390000${String(phoneSeq).padStart(4, '0')}`
  const info = db.prepare(`
    INSERT INTO accounts (phone, status, created_at, updated_at)
    VALUES (?, 'active', ?, ?)
  `).run(phone, now, now)
  return Number(info.lastInsertRowid)
}

test('entitlements are cached until the cache is invalidated', () => {
  const accountId = seedAccount()
  const token = accounts.createSession({ accountId })

  assert.equal(accounts.getEntitlements({ token }).isMember, false)

  // 模拟「后台直接改库」这类绕过服务层的变更：缓存期内仍返回旧值
  db.prepare('UPDATE accounts SET membership_expires_at = ? WHERE id = ?')
    .run(Date.now() + 24 * 60 * 60 * 1000, accountId)
  assert.equal(accounts.getEntitlements({ token }).isMember, false)

  accounts.invalidateEntitlementCache()
  assert.equal(accounts.getEntitlements({ token }).isMember, true)
})

test('grantMembership invalidates the cache without waiting for TTL', () => {
  const accountId = seedAccount()
  const token = accounts.createSession({ accountId })

  assert.equal(accounts.getEntitlements({ token }).isMember, false)

  const granted = accounts.grantMembership({ accountId, plan: 'month', days: 30 })
  assert.equal(granted.ok, true)

  // 付款后下一次轮询就应该解锁，不能等 15 秒
  assert.equal(accounts.getEntitlements({ token }).isMember, true)
})

test('revoking a session invalidates cached entitlements', () => {
  const accountId = seedAccount()
  const token = accounts.createSession({ accountId })

  accounts.grantMembership({ accountId, plan: 'month', days: 30 })
  assert.equal(accounts.getEntitlements({ token }).isMember, true)

  accounts.revokeSession(token)
  // 会话已删，即使缓存还在也不能再认这个 token
  assert.equal(accounts.getEntitlements({ token }).isMember, false)
})
