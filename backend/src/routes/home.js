import { Router } from 'express'
import * as marketData from '../services/marketDataService.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const [indices, sentiment] = await Promise.all([
      marketData.getIndices(),
      marketData.getSentiment(),
    ])
    res.json({ indices, sentiment, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[home] API failed:', err.message)
    // fallback: return empty data, frontend will use mock
    res.json({
      indices: [],
      sentiment: {
        ztCount: 0, dtCount: 0, ztRatio: 0, kuiqian: 0,
        mainFlow: 0, lianbanHeight: 0, upCount: 0, downCount: 0, turnover: 0,
      },
      timestamp: new Date().toISOString(),
    })
  }
})

export default router
