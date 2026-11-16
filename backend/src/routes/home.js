import { Router } from 'express'
import * as marketData from '../services/marketDataService.js'
import * as logger from '../utils/logger.js'

const router = Router()

/**
 * 首页数据。
 *
 * 关键约束：**不能把上游故障伪装成「0 家涨停」**。
 *
 * 旧实现 catch 之后返回 200 + 全 0，前端无法区分「今天真的没有涨停」和
 * 「东方财富挂了」。对短线工具来说，这两种情况的含义完全相反；用户按 0 家涨停
 * 做判断，比看到「数据暂不可用」危险得多。
 *
 * 现在的口径：
 *   · 指数和情绪各自独立获取，一边失败不影响另一边（原来是一起 try，一边挂全挂）；
 *   · 两边都拿不到 → 503，前端显示不可用，不渲染 0；
 *   · 只有一边 → 200 + degraded，前端照常展示可用部分并给出提示。
 */
router.get('/', async (req, res) => {
  const [indicesResult, sentimentResult] = await Promise.allSettled([
    marketData.getIndices(),
    marketData.getSentiment(),
  ])

  const indices = indicesResult.status === 'fulfilled' && Array.isArray(indicesResult.value)
    ? indicesResult.value
    : []
  const sentiment = sentimentResult.status === 'fulfilled' ? sentimentResult.value : null

  const unavailable = []
  if (!indices.length) unavailable.push('indices')
  if (!sentiment) unavailable.push('sentiment')

  const timestamp = new Date().toISOString()

  if (!indices.length && !sentiment) {
    logger.warn('home_data_unavailable', {
      indicesError: indicesResult.status === 'rejected' ? indicesResult.reason?.message : '',
      sentimentError: sentimentResult.status === 'rejected' ? sentimentResult.reason?.message : '',
    })

    return res.status(503).json({
      error: '行情数据暂时不可用，请稍后再试',
      degraded: true,
      unavailable,
      indices: [],
      sentiment: null,
      timestamp,
    })
  }

  if (unavailable.length) {
    logger.warn('home_data_partial', { unavailable })
  }

  return res.json({
    indices,
    sentiment,
    degraded: unavailable.length > 0,
    unavailable,
    timestamp,
  })
})

export default router
