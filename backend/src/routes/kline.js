import { Router } from 'express'
import * as marketData from '../services/marketDataService.js'

const router = Router()

router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params
    const { type = 'day' } = req.query
    const result = await marketData.getKline(code, type)
    res.json({ ...result, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[kline] API failed:', err.message)
    res.json({ code: req.params.code, type: req.query.type || 'day', data: [], timestamp: new Date().toISOString() })
  }
})

export default router
