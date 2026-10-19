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
import userRoutes from './routes/user.js'
import eventRoutes from './routes/event.js'
import authRoutes, { purgeSessions } from './routes/auth.js'
import payRoutes from './routes/pay.js'
import adminRoutes from './routes/admin.js'
import db from './db/index.js'
import { rateLimit, securityHeaders } from './middleware/security.js'
import { attachSession } from './middleware/session.js'
import * as pay from './services/payService.js'
import * as sms from './services/smsService.js'
import * as admin from './services/adminService.js'
import * as ztliveSocket from './services/ztliveSocketService.js'
import * as ztliveStream from './services/ztliveStreamService.js'
import * as logger from './utils/logger.js'

/**
 * 生产配置自检。
 *
 * 这些组合不会让服务启动失败，但会静默削弱安全性或让用户收不到短信/看不到收款码。
 * 只打告警而不退出，是为了避免一次误配置把已有服务直接打挂；部署脚本会再校验健康接口。
 */
function warnProductionConfiguration() {
  if (process.env.NODE_ENV !== 'production') return

  const warnings = []
  if (config.corsOrigin === '*') {
    warnings.push('CORS_ORIGIN=*：任意站点都能调用 API，生产环境请改成真实前端域名')
  }
  if (String(process.env.SMS_DRIVER || 'console').toLowerCase() === 'console') {
    warnings.push('SMS_DRIVER=console：验证码只会写进日志，用户收不到短信')
  }
  if (!process.env.SMS_HASH_SALT) {
    warnings.push('SMS_HASH_SALT 未设置：正在使用公开的默认盐值')
  }
  if (String(process.env.PAY_AUTO_APPROVE || '') === '1') {
    warnings.push('PAY_AUTO_APPROVE=1：用户点「我已付款」就会自动开通，未经人工核对')
  }

  const nodeMajor = Number(process.versions.node.split('.')[0])
  if (config.ztliveWsEnabled && nodeMajor < 22) {
    warnings.push(`Node ${process.versions.node} 没有全局 WebSocket，封板事件流会降级为纯轮询`)
  }

  warnings.forEach((message) => logger.warn('config_warning', { message }))
}

warnProductionConfiguration()

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
// 认证头要在路由之前解析：行情接口也要按登录态下发权益
app.use(attachSession)
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
app.use('/api/user', userRoutes)
app.use('/api/event', eventRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/pay', payRoutes)
// 运营后台。所有接口都在 requireAdmin 之后，未登录一律 401；
// 未初始化管理员时连 /login 也只回「请先执行 npm run admin init」。
app.use('/api/admin', adminRoutes)

/**
 * 定期清理：过期会话、过期验证码、超时未付款订单。
 * 这三张表都是写多读少的流水表，不清理会长成慢查询的来源。
 */
const HOUSEKEEPING_INTERVAL_MS = 6 * 60 * 60 * 1000
function housekeeping() {
  try {
    const sessions = purgeSessions()
    const codes = sms.purgeExpiredCodes()
    const orders = pay.expireOrders()
    const adminSessions = admin.purgeExpiredAdminSessions()
    if (sessions || codes || orders || adminSessions) {
      logger.info('housekeeping', { sessions, codes, orders, adminSessions })
    }
  } catch (error) {
    logger.error('housekeeping_failed', { message: error.message })
  }
}
housekeeping()
setInterval(housekeeping, HOUSEKEEPING_INTERVAL_MS).unref()

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
    node: process.version,
    websocket: typeof WebSocket !== 'undefined',
  })

  // 上游封板事件流：与快照轮询并行跑，互相独立。
  // 上游不可用时它自己退避重连，不会影响接口可用性。
  ztliveSocket.start()
})

/**
 * 优雅退出：先把 SSE 连接收干净，再断开上游。
 * 不这么做的话，浏览器要等 TCP 超时才发现服务没了，中间这段时间页面看起来是
 * 「连着但一直不推」——比直接断开更让人困惑。
 */
function shutdown(signal) {
  logger.info('server_shutdown', { signal })
  try {
    ztliveStream.closeAll()
    ztliveSocket.stop()
  } catch (error) {
    logger.warn('server_shutdown_cleanup_failed', { message: error.message })
  }
  process.exit(0)
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
