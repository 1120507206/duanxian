import test from 'node:test'
import assert from 'node:assert/strict'
import { asyncHandler } from '../../backend/src/utils/asyncHandler.js'

test('asyncHandler forwards rejected promises to next()', async () => {
  const expected = new Error('boom')
  const handler = asyncHandler(async () => {
    throw expected
  })

  let received
  handler({}, {}, (error) => {
    received = error
  })

  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(received, expected)
})

test('asyncHandler leaves successful handlers alone', async () => {
  let called = false
  let nextCalled = false
  const handler = asyncHandler(async (_req, res) => {
    called = true
    res.done = true
  })

  handler({}, {}, () => {
    nextCalled = true
  })

  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(called, true)
  assert.equal(nextCalled, false)
})
