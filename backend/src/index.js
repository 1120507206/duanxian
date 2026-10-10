import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import config from './config/index.js'
import homeRoutes from './routes/home.js'
import lianbanRoutes from './routes/lianban.js'
import longhuRoutes from './routes/longhu.js'
import jingjiaRoutes from './routes/jingjia.js'
import zijinRoutes from './routes/zijin.js'
import zixuanRoutes from './routes/zixuan.js'
import fupanRoutes from './routes/fupan.js'
import klineRoutes from './routes/kline.js'
import healthRoutes from './routes/health.js'
import ztliveRoutes from './routes/ztlive.js'
import db from './db/index.js'
import { rateLimit, securityHeaders } from './middleware/security.js'
import * as logger from './utils/logger.js'

// 首次启动自动初始化种子数据
const hasData = db.prepare('SELECT COUNT(*) as cnt FROM market_indices').get()
if (!hasData || hasData.cnt === 0) {
  logger.info('db_seed_start', { reason: 'empty_market_indices' })
  await import('./db/seed.js')
}

const app = express()

app.set('trust proxy', 1)
app.disable('x-powered-by')

app.use(cors({
  origin: config.corsOrigin === '*' ? true : config.corsOrigin,
}))
app.use(morgan('dev'))
app.use(securityHeaders)
app.use(rateLimit)
app.use(express.json({ limit: '1mb' }))

// 路由
app.use('/api/home', homeRoutes)
app.use('/api/lianban', lianbanRoutes)
app.use('/api/longhu', longhuRoutes)
app.use('/api/jingjia', jingjiaRoutes)
app.use('/api/zijin', zijinRoutes)
app.use('/api/zixuan', zixuanRoutes)
app.use('/api/fupan', fupanRoutes)
app.use('/api/kline', klineRoutes)
app.use('/api/health', healthRoutes)
app.use('/api/ztlive', ztliveRoutes)

app.get('/', (req, res) => {
  res.json({
    name: 'duanxian-api',
    status: 'ok',
    health: '/api/health',
  })
})

app.use('/api', (req, res) => {
  res.status(404).json({ error: '接口不存在' })
})

app.use((err, req, res, next) => {
  logger.error('api_unhandled_error', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    error: err,
  })
  res.status(500).json({ error: '服务暂时不可用' })
})

app.listen(config.port, () => {
  logger.info('server_started', {
    port: config.port,
    apiBase: `http://localhost:${config.port}/api`,
  })
})
