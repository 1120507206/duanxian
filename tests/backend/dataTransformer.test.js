import test from 'node:test'
import assert from 'node:assert/strict'
import {
  transformLianban,
  transformLonghu,
  transformFupan,
  transformZijin,
} from '../../backend/src/services/dataTransformer.js'

test('transformLianban sorts by board height and keeps a default board of 1', () => {
  const rows = transformLianban([
    { code: '000001', name: 'A', price: 10, pct: 5, industry: '银行' },
    { code: '000002', name: 'B', price: 20, pct: 9.9, industry: '地产' },
  ], { '000002': 3 })

  assert.equal(rows[0].code, '000002')
  assert.equal(rows[0].board, 3)
  assert.equal(rows[1].board, 1)
  assert.equal(rows[1].firstTime, '--')
})

test('transformLonghu converts yuan amounts to ten-thousand yuan', () => {
  const rows = transformLonghu([
    {
      code: '600000',
      name: '浦发银行',
      reason: '涨幅偏离',
      price: 10,
      pct: 10,
      turnover: 5,
      buyTotal: 100000000,
      sellTotal: 40000000,
      netFlow: 60000000,
    },
  ], {
    '600000': {
      buyList: [{ name: '机构专用', amount: 1, dept: '机构专用' }],
      sellList: [],
    },
  })

  assert.equal(rows[0].buyTotal, 10000)
  assert.equal(rows[0].sellTotal, 4000)
  assert.equal(rows[0].netFlow, 6000)
  assert.equal(rows[0].buyList.length, 1)
})

test('transformFupan derives top lists from the lianban rows', () => {
  const data = transformFupan('2026-10-19', [
    { code: '000001', name: 'A', board: 1, pct: 9.9, turnover: 3, industry: '银行' },
    { code: '000002', name: 'B', board: 4, pct: 10, turnover: 8, industry: '地产' },
  ])

  assert.equal(data.ztCount, 2)
  assert.equal(data.topZt[0].code, '000002')
  assert.equal(data.topAmount[0].code, '000002')
  assert.equal(data.hotPlates.length, 0)
})

test('transformZijin keeps leader stocks under each plate', () => {
  const rows = transformZijin([
    { code: 'BK001', name: '半导体', mainIn: 2, totalIn: 5, pct: 1.2 },
  ], {
    BK001: [{ code: '688001', name: '华兴源创', pct: 8 }],
  })

  assert.equal(rows[0].name, '半导体')
  assert.equal(rows[0].topStocks[0].code, '688001')
  assert.equal(rows[0].topStocks[0].flow, 0)
})
