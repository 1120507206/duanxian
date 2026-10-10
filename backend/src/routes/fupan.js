import { Router } from 'express'
import * as marketData from '../services/marketDataService.js'

const router = Router()
const today = () => new Date().toISOString().split('T')[0]

router.get('/', async (req, res) => {
  try {
    const date = req.query.date || today()
    const data = await marketData.getFupan(date)
    res.json(data)
  } catch (err) {
    console.error('[fupan] API failed:', err.message)
    res.json({
      date: req.query.date || today(),
      ztCount: 0, dtCount: 0, zbCount: 0, fbCount: 0,
      sentiment: [], hotPlates: [], topZt: [], topAmount: [],
    })
  }
})

export default router
