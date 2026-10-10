import { Router } from 'express'
import * as cache from '../services/cacheService.js'
import * as ztlive from '../services/ztliveService.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const key = 'ztlive:all'
    const cached = cache.get(key)
    if (cached !== undefined) return res.json(cached)

    const data = await ztlive.getZtlive()
    cache.set(key, data, 'ztlive')
    return res.json(data)
  } catch (error) {
    return res.status(503).json({
      error: '涨停播报数据暂时不可用',
      detail: process.env.NODE_ENV === 'production' ? undefined : error.message,
    })
  }
})

export default router
