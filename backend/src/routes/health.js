import { Router } from 'express'
import config from '../config/index.js'
import db from '../db/index.js'
import * as cache from '../services/cacheService.js'
import * as ztliveSocket from '../services/ztliveSocketService.js'

const router = Router()

router.get('/', (req, res) => {
  const dbOk = db.prepare('SELECT 1 as ok').get()?.ok === 1
  const websocketSupported = typeof WebSocket !== 'undefined'
  const socket = ztliveSocket.getStatus()

  // 健康检查要能回答「部署是否真的具备实时能力」。Node 20 没有全局 WebSocket，
  // 但服务仍能启动并退回轮询 —— 只看 200 会漏掉这种静默降级。
  const reasons = []
  if (!dbOk) reasons.push('database_unavailable')
  if (config.ztliveWsEnabled && !websocketSupported) reasons.push('websocket_unavailable')

  res.json({
    status: reasons.length ? 'degraded' : 'ok',
    reasons,
    time: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    memory: process.memoryUsage(),
    runtime: {
      node: process.version,
      websocket: websocketSupported,
    },
    database: {
      type: 'sqlite',
      ok: dbOk,
    },
    realtime: {
      enabled: config.ztliveWsEnabled,
      state: socket.state,
      lastEventAt: socket.lastEventAt,
      reconnects: socket.reconnects,
    },
    cache: cache.getStats(),
  })
})

export default router
