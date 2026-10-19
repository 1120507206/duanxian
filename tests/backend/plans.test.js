import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PLANS,
  getPlan,
  getPurchasablePlans,
  isValidPlan,
} from '../../backend/src/config/plans.js'

test('trial plan is internal and never appears in checkout', () => {
  const keys = getPurchasablePlans().map((plan) => plan.key)
  assert.deepEqual(keys, ['month', 'quarter', 'year'])
  assert.equal(PLANS.trial.purchasable, false)
})

test('known plans expose duration and price', () => {
  assert.equal(getPlan('year').durationDays, 365)
  assert.equal(getPlan('month').price, 39)
  assert.equal(getPlan('trial').durationDays, 30)
})

test('unknown plan keys are rejected', () => {
  assert.equal(isValidPlan('unknown'), false)
  assert.equal(getPlan('unknown'), null)
})
