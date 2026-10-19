import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isTradingDay,
  isTradingTime,
  getMarketStatusText,
} from '../../frontend/src/utils/tradingCalendar.js'

test('weekends and configured holidays are not trading days', () => {
  assert.equal(isTradingDay(new Date(2026, 9, 17)), false) // Saturday
  assert.equal(isTradingDay(new Date(2026, 9, 1)), false) // National Day holiday
  assert.equal(isTradingDay(new Date(2026, 9, 19)), true) // Monday
})

test('trading time covers the morning and afternoon sessions', () => {
  const day = new Date(2026, 9, 19)
  const at = (hour, minute) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute)

  assert.equal(isTradingTime(at(9, 15)), true)
  assert.equal(isTradingTime(at(11, 30)), true)
  assert.equal(isTradingTime(at(13, 0)), true)
  assert.equal(isTradingTime(at(15, 0)), true)

  assert.equal(isTradingTime(at(9, 14)), false)
  assert.equal(isTradingTime(at(11, 31)), false)
  assert.equal(isTradingTime(at(12, 0)), false)
  assert.equal(isTradingTime(at(15, 1)), false)
})

test('market status text distinguishes trading, lunch break and holidays', () => {
  const at = (hour, minute) => new Date(2026, 9, 19, hour, minute)
  assert.equal(getMarketStatusText(at(10, 0)), '盘中')
  assert.equal(getMarketStatusText(at(12, 0)), '休市')
  assert.equal(getMarketStatusText(new Date(2026, 9, 17, 10, 0)), '非交易日')
})
