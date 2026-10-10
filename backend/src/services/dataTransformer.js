// Pure transformation functions: East Money field codes → frontend camelCase

export function transformIndices(raw) {
  return raw
}

export function transformSentiment(upDown, limitCounts, turnover) {
  return {
    ztCount: limitCounts.ztCount,
    dtCount: limitCounts.dtCount,
    ztRatio: limitCounts.ztCount > 0
      ? Math.round(limitCounts.ztCount / (limitCounts.ztCount + limitCounts.dtCount || 1) * 100)
      : 0,
    kuiqian: 0,
    mainFlow: 0,
    lianbanHeight: 0,
    upCount: upDown.upCount,
    downCount: upDown.downCount,
    turnover: turnover || upDown.turnover || 0,
  }
}

export function transformLianban(stocks, boardMap) {
  return stocks.map((item) => ({
    code: item.code,
    name: item.name,
    industry: item.industry || '',
    board: boardMap[item.code] || 1,
    price: item.price,
    pct: item.pct,
    turnover: item.turnover || 0,
    fengdan: 0,
    marketVal: item.marketVal || 0,
    firstTime: '--',
  })).sort((a, b) => b.board - a.board || b.pct - a.pct)
}

export function transformLonghu(list, detailsMap) {
  return list.map((item) => {
    const detail = detailsMap[item.code] || { buyList: [], sellList: [] }
    return {
      code: item.code,
      name: item.name,
      reason: item.reason,
      price: item.price,
      pct: item.pct,
      turnover: item.turnover,
      buyList: detail.buyList,
      sellList: detail.sellList,
      buyTotal: item.buyTotal / 1e4,
      sellTotal: item.sellTotal / 1e4,
      netFlow: item.netFlow / 1e4,
    }
  })
}

export function transformJingjia(raw) {
  return raw.map((item) => ({
    code: item.code,
    name: item.name,
    jjPct: item.jjPct,
    jjAmount: item.jjAmount,
    openPct: item.openPct,
    price: item.price,
    volume: item.volume,
    ztBoard: item.ztBoard,
  })).sort((a, b) => b.jjPct - a.jjPct)
}

export function transformZijin(raw, leadersMap) {
  return raw.map((item) => ({
    name: item.name,
    mainIn: item.mainIn || 0,
    superIn: item.superIn || 0,
    totalIn: item.totalIn || 0,
    pct: item.pct || 0,
    topStocks: (leadersMap[item.code] || []).map((l) => ({
      code: l.code,
      name: l.name,
      pct: l.pct,
      flow: 0,
    })),
  })).sort((a, b) => b.totalIn - a.totalIn)
}

export function transformFupan(date, lianbanData, longhuData, sentimentData) {
  const ztList = lianbanData || []
  const ztCount = ztList.length
  const dtCount = 0
  const topZt = [...ztList].sort((a, b) => b.board - a.board).slice(0, 10)
  const topAmount = [...ztList].sort((a, b) => (b.turnover || 0) - (a.turnover || 0)).slice(0, 10)
    .map((s) => ({ code: s.code, name: s.name, amount: s.turnover || 0, pct: s.pct }))

  return {
    date,
    ztCount,
    dtCount,
    zbCount: 0,
    fbCount: 0,
    sentiment: [],
    hotPlates: [],
    topZt: topZt.map((s) => ({
      code: s.code, name: s.name, board: s.board, pct: s.pct, industry: s.industry || '',
    })),
    topAmount,
  }
}
