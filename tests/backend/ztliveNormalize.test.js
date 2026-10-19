import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRow, normalizeEventRow } from '../../backend/src/services/ztliveService.js'

test('normalizeRow maps snapshot fields and drops unknown upstream fields', () => {
  const row = normalizeRow({
    code: '600519',
    name: '贵州茅台',
    bannum: '3板',
    lianban: 3,
    price: 1700,
    zf: 9.98,
    jjzf: 1.2,
    fund: 123456789,
    amount: 987654321,
    ftime: '09:31:02',
    etime: '14:57:00',
    realhs: 2.3,
    realsz: 2100000000000,
    plate: '白酒',
    ztyy: '业绩预增',
    zhai: null,
    readurl: 'https://audio.example/secret.mp3',
  })

  assert.equal(row.code, '600519')
  assert.equal(row.id, '600519')
  assert.equal(row.status, '涨停')
  assert.equal(row.board, '3板')
  assert.equal(row.boardNumber, 3)
  assert.equal(row.sealAmountText, '1.23亿')
  assert.equal(row.plate, '白酒')
  assert.equal(row.topic, '业绩预增')
  assert.equal('readurl' in row, false)
})

test('snapshot rule treats fund <= 0 as blown', () => {
  const row = normalizeRow({ code: '000001', name: '平安银行', fund: 0, zhaban: 0 })
  assert.equal(row.status, '炸板')
  assert.equal(row.sealAmountText, '--')
})

test('event rule ignores fund because it is often missing at the seal moment', () => {
  const row = normalizeEventRow({
    code: '000002',
    name: '万科A',
    fund: 0,
    zhaban: 0,
    time: '09:30:00',
    ztnum: '2板',
  })

  assert.equal(row.status, '涨停')
  assert.equal(row.boardNumber, 2)
  assert.equal(row.firstTime, '09:30:00')
})

test('snapshot and event rows share the same shape', () => {
  const snapshot = normalizeRow({ code: '600000', name: '浦发银行', fund: 100 })
  const event = normalizeEventRow({ code: '600000', name: '浦发银行', fund: 0 })
  assert.deepEqual(Object.keys(snapshot).sort(), Object.keys(event).sort())
})

test('invalid event payload returns null', () => {
  assert.equal(normalizeEventRow(null), null)
  assert.equal(normalizeEventRow('not-an-object'), null)
})

test('missing code falls back to an index-based row id', () => {
  const row = normalizeRow({}, 7)
  assert.equal(row.code, '--')
  assert.equal(row.id, 'row-7')
})

test('explicit lianban overrides a first-board label', () => {
  const row = normalizeRow({ code: '300001', bannum: '首板', lianban: 2 })
  assert.equal(row.boardNumber, 2)
})
