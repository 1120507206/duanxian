import { Router } from 'express'
import * as marketData from '../services/marketDataService.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const list = await marketData.getJingjia()
    res.json({ list, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[jingjia] API failed:', err.message)
    res.json({ list: [], timestamp: new Date().toISOString() })
  }
})

export default router
