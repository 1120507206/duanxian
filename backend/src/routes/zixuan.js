import { Router } from 'express'
import db from '../db/index.js'
import * as marketData from '../services/marketDataService.js'
import * as logger from '../utils/logger.js'

const router = Router()

/**
 * 自选股列表。
 *
 * 这里曾经在行情拉取失败时用 `Math.random()` 生成价格 —— 那等于给用户看假行情。
 * 金融工具里「没有数据」和「编一个数据」是完全不同的两件事：
 * 前者用户会去别处核对，后者用户会拿它做交易决策。
 *
 * 现在行情拿不到就明确返回 `price: null` + `quoteAvailable: false`，
 * 由前端显示「-- / 行情暂不可用」，不在任何一层做估算。
 */
router.get('/', async (req, res) => {
  try {
    const list = db.prepare('SELECT * FROM zixuan ORDER BY added_at DESC').all()

    let liveQuotes = []
    let quoteError = ''
    if (list.length > 0) {
      try {
        const codes = list.map((s) => s.code)
        liveQuotes = await marketData.getQuotes(codes)
      } catch (error) {
        quoteError = error.message
        logger.warn('zixuan_quotes_failed', { error })
      }
    }

    const quotesMap = {}
    for (const quote of liveQuotes) {
      quotesMap[quote.code] = quote
    }

    const result = list.map((s) => {
      const live = quotesMap[s.code]
      return {
        code: s.code,
        name: s.name,
        addedAt: s.added_at,
        price: live ? live.price : null,
        pct: live ? live.pct : null,
        quoteAvailable: Boolean(live),
      }
    })

    return res.json({
      list: result,
      // 有自选但一条行情都没拿到 → 整份列表降级；前端据此显示统一提示
      degraded: list.length > 0 && liveQuotes.length === 0,
      quoteError: quoteError || undefined,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('zixuan_list_failed', { error })
    return res.status(500).json({ error: '数据查询失败' })
  }
})

router.post('/', (req, res) => {
  try {
    const { code, name } = req.body
    if (!code || !name) {
      return res.status(400).json({ error: '缺少 code 或 name' })
    }
    const existing = db.prepare('SELECT code FROM zixuan WHERE code = ?').get(code)
    if (existing) {
      return res.status(409).json({ error: '已存在' })
    }
    db.prepare('INSERT INTO zixuan (code, name, added_at) VALUES (?, ?, ?)').run(code, name, Date.now())
    return res.json({ success: true })
  } catch (error) {
    logger.error('zixuan_add_failed', { error })
    return res.status(500).json({ error: '添加失败' })
  }
})

router.delete('/:code', (req, res) => {
  try {
    db.prepare('DELETE FROM zixuan WHERE code = ?').run(req.params.code)
    return res.json({ success: true })
  } catch (error) {
    logger.error('zixuan_delete_failed', { error })
    return res.status(500).json({ error: '删除失败' })
  }
})

export default router
