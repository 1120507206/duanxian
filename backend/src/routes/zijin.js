import { Router } from 'express'
import * as marketData from '../services/marketDataService.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const list = await marketData.getZijin()
    res.json({ list, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[zijin] API failed:', err.message)
    res.json({ list: [], timestamp: new Date().toISOString() })
  }
})

export default router
