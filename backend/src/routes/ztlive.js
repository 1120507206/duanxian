import { Router } from 'express'
import * as ztlive from '../services/ztliveService.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    return res.json(await ztlive.getZtliveCached())
  } catch (error) {
    return res.status(503).json({
      error: '涨停播报数据暂时不可用',
      detail: process.env.NODE_ENV === 'production' ? undefined : error.message,
    })
  }
})

export default router
