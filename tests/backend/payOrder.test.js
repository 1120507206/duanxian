import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// 必须在 import 数据库之前指定临时库，否则测试会往 backend/data/duanxian.db 里写。
const dataDir = mkdtempSync(path.join(tmpdir(), 'duanxian-pay-'))
process.env.DB_PATH = path.join(dataDir, 'test.db')

const { default: db } = await import('../../backend/src/db/index.js')
const pay = await import('../../backend/src/services/payService.js')

function createAccount(phone = '13800000000') {
  const now = Date.now()
  db.prepare(`
    INSERT INTO accounts (phone, status, created_at, updated_at)
    VALUES (?, 'active', ?, ?)
  `).run(phone, now, now)
  return Number(db.prepare('SELECT id FROM accounts WHERE phone = ?').get(phone).id)
}

test('createOrder persists a pending order with a collision-resistant number', () => {
  const accountId = createAccount()
  const result = pay.createOrder({ accountId, plan: 'month', payMethod: 'wx' })

  assert.equal(result.ok, true)
  assert.match(result.order.orderNo, /^DX\d{8}[0-9A-Z]{6}$/)
  assert.equal(result.order.status, 'pending')
  assert.equal(result.order.accountId, accountId)

  const row = db.prepare('SELECT * FROM payment_orders WHERE order_no = ?').get(result.order.orderNo)
  assert.ok(row, '订单应该真的落库')
  assert.equal(row.status, 'pending')
})

test('createOrder rejects an unpurchasable plan before touching the DB', () => {
  const accountId = createAccount('13800000001')
  const result = pay.createOrder({ accountId, plan: 'trial', payMethod: 'wx' })

  assert.equal(result.ok, false)
  assert.equal(result.error, '套餐不存在')
})
