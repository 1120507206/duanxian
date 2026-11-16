import test from 'node:test'
import assert from 'node:assert/strict'
import { makeOrderNo } from '../../backend/src/utils/orderNo.js'

test('makeOrderNo uses local date and a 6-char base36 suffix', () => {
  const orderNo = makeOrderNo(new Date(2026, 10, 2))

  assert.match(orderNo, /^DX20261102[0-9A-Z]{6}$/)
})

test('makeOrderNo keeps a reasonable spread within one day', () => {
  // 200 个样本落在 21.8 亿的空间里，撞号概率约 1e-5；
  // 这里只验证「不是固定值 / 不是自增」，不把概率测试写成偶发失败。
  const values = new Set()
  for (let i = 0; i < 200; i += 1) values.add(makeOrderNo())

  assert.equal(values.size, 200)
})

test('makeOrderNo ignores time of day but not the calendar day', () => {
  const morning = makeOrderNo(new Date(2026, 10, 2, 1, 0, 0))
  const evening = makeOrderNo(new Date(2026, 10, 2, 23, 59, 59))
  const nextDay = makeOrderNo(new Date(2026, 10, 3, 1, 0, 0))

  assert.ok(morning.startsWith('DX20261102'))
  assert.ok(evening.startsWith('DX20261102'))
  assert.ok(nextDay.startsWith('DX20261103'))
})
