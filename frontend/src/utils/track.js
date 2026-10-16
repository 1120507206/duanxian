import { reportEvent } from '@/api'
import { getDeviceId, getChannel } from '@/utils/deviceId'

/**
 * 埋点上报。
 *
 * 三条硬约束：
 * 1. 绝不影响主流程 —— 上报失败只进 console，不弹提示、不抛异常。
 * 2. 同一事件做去重节流 —— 涨停播报每 3 秒轮询一次，页面级事件不能跟着刷。
 * 3. 会话内相同事件只报一次（除非显式允许重复），否则「打开页面」这类事件会被
 *    标签页切换、组件重挂载放大成几十条，统计出来全是噪音。
 */

const reportedOnce = new Set()
const lastReportAt = new Map()

/** 同事件最小上报间隔：给允许重复的事件（如搜索、筛选）做节流 */
const REPEAT_GAP_MS = 5000

/**
 * @param {string} event 事件名，必须在后端白名单内
 * @param {object} [meta] 附加信息（只放不会变成用户画像的粗粒度事实）
 * @param {object} [options]
 * @param {boolean} [options.repeat] 允许同一会话内重复上报（默认只报一次）
 */
export function track(event, meta = null, { repeat = false } = {}) {
  if (!event) return

  const now = Date.now()

  if (!repeat) {
    if (reportedOnce.has(event)) return
    reportedOnce.add(event)
  } else {
    const last = lastReportAt.get(event) || 0
    if (now - last < REPEAT_GAP_MS) return
    lastReportAt.set(event, now)
  }

  try {
    reportEvent({
      deviceId: getDeviceId(),
      event,
      channel: getChannel(),
      path: window.location.pathname,
      meta: meta || undefined,
    }).catch(() => {
      // 埋点失败不需要惊动用户
    })
  } catch (_) {
    // 同上：埋点永远不能让主流程失败
  }
}
