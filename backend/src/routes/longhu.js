import { Router } from 'express'
import * as marketData from '../services/marketDataService.js'

const router = Router()
const today = () => new Date().toISOString().split('T')[0]

router.get('/', async (req, res) => {
  try {
    const date = req.query.date || today()
    const list = await marketData.getLonghu(date)
    res.json({ list, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[longhu] API failed:', err.message)
    res.json({ list: [], timestamp: new Date().toISOString() })
  }
})

export default router
