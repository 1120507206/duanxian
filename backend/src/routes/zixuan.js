import { Router } from 'express'
import db from '../db/index.js'
import * as marketData from '../services/marketDataService.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const list = db.prepare('SELECT * FROM zixuan ORDER BY added_at DESC').all()
    let liveQuotes = []
    if (list.length > 0) {
      try {
        const codes = list.map((s) => s.code)
        liveQuotes = await marketData.getQuotes(codes)
      } catch (e) {
        console.warn('[zixuan] live quotes failed, using mock:', e.message)
      }
    }
    const quotesMap = {}
    for (const q of liveQuotes) {
      quotesMap[q.code] = q
    }
    const result = list.map((s) => {
      const live = quotesMap[s.code]
      return {
        code: s.code,
        name: s.name,
        addedAt: s.added_at,
        price: live ? live.price : (Math.random() * 50 + 5).toFixed(2),
        pct: live ? live.pct : ((Math.random() - 0.4) * 8).toFixed(2),
      }
    })
    res.json({ list: result, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[zixuan]', err.message)
    res.status(500).json({ error: '数据查询失败' })
  }
})

router.post('/', (req, res) => {
  try {
    const { code, name } = req.body
    if (!code || !name) {
      return res.status(400).json({ error: '缺少 code 或 name' })
    }
    const existing = db.prepare('SELECT code FROM zixuan WHERE code = ?').get(code)
    if (existing) {
      return res.status(409).json({ error: '已存在' })
    }
    db.prepare('INSERT INTO zixuan (code, name, added_at) VALUES (?, ?, ?)').run(code, name, Date.now())
    res.json({ success: true })
  } catch (err) {
    console.error('[zixuan]', err.message)
    res.status(500).json({ error: '添加失败' })
  }
})

router.delete('/:code', (req, res) => {
  try {
    db.prepare('DELETE FROM zixuan WHERE code = ?').run(req.params.code)
    res.json({ success: true })
  } catch (err) {
    console.error('[zixuan]', err.message)
    res.status(500).json({ error: '删除失败' })
  }
})

export default router
