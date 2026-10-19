import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatNumber,
  formatPercent,
  formatMoneyFromYuan,
  formatMarketCap,
  formatClock,
} from '../../frontend/src/utils/ztliveFormat.js'

test('formatNumber handles invalid input without inventing a value', () => {
  assert.equal(formatNumber(1.234), '1.23')
  assert.equal(formatNumber('1.234', 1), '1.2')
  assert.equal(formatNumber('not-a-number'), '--')
})

test('formatPercent keeps the sign and two decimals', () => {
  assert.equal(formatPercent(9.876), '+9.88%')
  assert.equal(formatPercent(-1.234), '-1.23%')
  assert.equal(formatPercent(0), '+0.00%')
  assert.equal(formatPercent(undefined), '--')
})

test('formatMoneyFromYuan switches between wan and yi', () => {
  assert.equal(formatMoneyFromYuan(123456), '12万')
  assert.equal(formatMoneyFromYuan(123456789), '1.23亿')
  assert.equal(formatMoneyFromYuan('bad'), '--')
})

test('formatMarketCap uses qianyi above one hundred billion', () => {
  assert.equal(formatMarketCap(100000000000), '1.0千亿')
  assert.equal(formatMarketCap(50000000000), '500.0亿')
})

test('formatClock returns a placeholder or the original invalid text', () => {
  assert.equal(formatClock(null), '--')
  assert.equal(formatClock('not-a-date'), 'not-a-date')
})
