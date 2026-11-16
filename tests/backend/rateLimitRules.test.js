import test from 'node:test'
import assert from 'node:assert/strict'
import { rateLimitRuleFor } from '../../backend/src/middleware/security.js'

test('market endpoints use the client-scoped bucket', () => {
  // 播报页 3 秒轮询，必须按 token/device 计数，不能被同一出口 IP 的邻居连坐
  for (const path of ['/api/ztlive', '/api/home', '/api/lianban', '/api/kline/600519']) {
    const rule = rateLimitRuleFor(path)
    assert.equal(rule.name, 'market', path)
    assert.equal(rule.scope, 'client', path)
  }
})

test('SSE handshake has its own strict bucket', () => {
  const rule = rateLimitRuleFor('/api/ztlive/stream')

  // 顺序敏感：/api/ztlive/stream 也匹配 market 前缀，必须先命中 stream
  assert.equal(rule.name, 'stream')
  assert.equal(rule.max, 30)
})

test('login, activation and payment stay IP-scoped and strict', () => {
  for (const path of ['/api/auth/login', '/api/auth/register', '/api/user/activate']) {
    const rule = rateLimitRuleFor(path)
    assert.equal(rule.name, 'auth', path)
    assert.equal(rule.scope, 'ip', path)
  }

  assert.equal(rateLimitRuleFor('/api/pay/order').name, 'pay')
  assert.equal(rateLimitRuleFor('/api/pay/order/DX123/confirm').name, 'pay')
})

test('path matching follows Express case-insensitive and trailing-slash behavior', () => {
  // 否则换个大小写或补个斜杠就能绕过 SSE 专用桶
  assert.equal(rateLimitRuleFor('/API/ZTLIVE/STREAM/').name, 'stream')
  assert.equal(rateLimitRuleFor('/api/PAY/order').name, 'pay')
})

test('read-only auth bootstrap is not throttled like a login attempt', () => {
  // /auth/me 是每个标签页 bootstrap 都会调的只读接口，多开几个页面不该被当成撞库
  assert.equal(rateLimitRuleFor('/api/auth/me').name, 'default')
  assert.equal(rateLimitRuleFor('/api/auth/config').name, 'default')
})

test('admin and everything else fall back to their own buckets', () => {
  assert.equal(rateLimitRuleFor('/api/admin/me').name, 'admin')
  assert.equal(rateLimitRuleFor('/api/health').name, 'default')
})
