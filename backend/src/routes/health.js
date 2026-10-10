import { Router } from 'express'
import db from '../db/index.js'
import * as cache from '../services/cacheService.js'

const router = Router()

router.get('/', (req, res) => {
  const dbOk = db.prepare('SELECT 1 as ok').get()?.ok === 1

  res.json({
    status: dbOk ? 'ok' : 'degraded',
    time: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    memory: process.memoryUsage(),
    database: {
      type: 'sqlite',
      ok: dbOk,
    },
    cache: cache.getStats(),
  })
})

export default router
