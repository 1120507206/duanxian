import dayjs from 'dayjs'

// ========== 大盘指数 ==========
export const mockIndices = [
  { name: '上证指数', code: '000001', value: 3368.52, change: 0.78, pct: 0.02 },
  { name: '深证成指', code: '399001', value: 10876.34, change: 1.23, pct: 0.01 },
  { name: '创业板指', code: '399006', value: 2258.78, change: -0.45, pct: -0.02 },
  { name: '科创50', code: '000688', value: 1032.15, change: 2.15, pct: 0.21 },
]

// ========== 市场情绪指标 ==========
export const mockSentiment = {
  ztCount: 48,
  dtCount: 7,
  ztRatio: 87, // 封板率
  kuiqian: -2.3, // 亏钱效应指数
  mainFlow: 23.5, // 主力净流入(亿)
  lianbanHeight: 7, // 连板最高度
  upCount: 2156,
  downCount: 1823,
  turnover: 8921, // 成交额(亿)
}

// ========== 连板数据 ==========
export function generateLianbanData() {
  const boards = [7, 6, 5, 4, 3, 2]
  const stocks = [
    { code: '001234', name: '天龙股份', industry: '汽车零部件' },
    { code: '002345', name: '中恒电气', industry: '充电桩' },
    { code: '003456', name: '华立股份', industry: '智能家居' },
    { code: '004567', name: '京华激光', industry: '光刻机' },
    { code: '005678', name: '海得控制', industry: '机器人' },
    { code: '006789', name: '日发精机', industry: '工业母机' },
    { code: '007890', name: '南京公用', industry: '天然气' },
    { code: '008901', name: '世嘉科技', industry: '6G概念' },
    { code: '009012', name: '恒银科技', industry: '数字货币' },
    { code: '010123', name: '庚星股份', industry: '电子烟' },
    { code: '011234', name: '东晶电子', industry: '元器件' },
    { code: '012345', name: '惠威科技', industry: '智能音箱' },
    { code: '013456', name: '深圳华强', industry: '华为概念' },
    { code: '014567', name: '上海凤凰', industry: '自行车' },
    { code: '015678', name: '通达动力', industry: '减速器' },
    { code: '016789', name: '凯众股份', industry: '汽车热管理' },
  ]

  const result = []
  boards.forEach((board) => {
    const count = Math.min(board === 7 ? 1 : board === 6 ? 2 : 3, stocks.length - result.length)
    for (let i = 0; i < count; i++) {
      const stock = stocks[result.length % stocks.length]
      result.push({
        ...stock,
        board,
        price: (Math.random() * 50 + 5).toFixed(2),
        pct: (Math.random() * 6 + 4).toFixed(2),
        turnover: (Math.random() * 20 + 1).toFixed(2),
        fengdan: (Math.random() * 5 + 0.5).toFixed(2),
        marketVal: (Math.random() * 200 + 20).toFixed(0),
        change: Array.from({ length: 5 }, () => Math.random() > 0.4 ? 1 : 0),
        firstTime: `09:${String(Math.floor(Math.random() * 50) + 15).padStart(2, '0')}`,
      })
    }
  })
  return result
}

// ========== 龙虎榜数据 ==========
export function generateLonghuData() {
  const youzi = ['赵老哥', '章盟主', '方新侠', '炒股养家', '作手新一', '孙哥', '小鳄鱼', '湖州劳动路']
  const stocks = [
    { code: '001234', name: '天龙股份', reason: '日涨幅偏离值达7%' },
    { code: '002345', name: '中恒电气', reason: '连续三个交易日内涨幅偏离值累计达20%' },
    { code: '003456', name: '华立股份', reason: '日换手率达20%' },
    { code: '004567', name: '京华激光', reason: '日涨幅偏离值达7%' },
    { code: '005678', name: '海得控制', reason: '日振幅值达15%' },
    { code: '006789', name: '日发精机', reason: '连续三个交易日内涨幅偏离值累计达20%' },
    { code: '007890', name: '南京公用', reason: '日涨幅偏离值达7%' },
    { code: '008901', name: '世嘉科技', reason: '日换手率达20%' },
  ]

  return stocks.map((s, i) => {
    const buyCount = Math.floor(Math.random() * 4) + 1
    const sellCount = Math.floor(Math.random() * 3) + 1
    const buyList = []
    const sellList = []
    for (let j = 0; j < buyCount; j++) {
      buyList.push({
        name: youzi[Math.floor(Math.random() * youzi.length)],
        amount: (Math.random() * 8000 + 1000).toFixed(0),
        dept: ['中信证券上海分公司', '华泰证券总部', '国泰君安上海分公司', '东方财富拉萨团结路'][Math.floor(Math.random() * 4)],
      })
    }
    for (let j = 0; j < sellCount; j++) {
      sellList.push({
        name: youzi[Math.floor(Math.random() * youzi.length)],
        amount: (Math.random() * 5000 + 500).toFixed(0),
        dept: ['中信证券上海分公司', '华泰证券总部', '国泰君安上海分公司', '东方财富拉萨团结路'][Math.floor(Math.random() * 4)],
      })
    }
    const buyTotal = buyList.reduce((sum, b) => sum + Number(b.amount), 0)
    const sellTotal = sellList.reduce((sum, b) => sum + Number(b.amount), 0)
    return {
      ...s,
      price: (Math.random() * 50 + 5).toFixed(2),
      pct: (Math.random() * 6 + 4).toFixed(2),
      turnover: (Math.random() * 30 + 5).toFixed(2),
      buyList,
      sellList,
      buyTotal: buyTotal.toFixed(0),
      sellTotal: sellTotal.toFixed(0),
      netFlow: (buyTotal - sellTotal).toFixed(0),
    }
  })
}

// ========== 集合竞价数据 ==========
export function generateJingjiaData() {
  const stocks = []
  for (let i = 0; i < 30; i++) {
    const code = String(1000 + i).padStart(6, '0')
    stocks.push({
      code,
      name: ['天龙股份', '中恒电气', '华立股份', '京华激光', '海得控制', '日发精机', '南京公用', '世嘉科技'][i % 8] + (i > 7 ? String(i) : ''),
      jjPct: ((Math.random() - 0.3) * 12).toFixed(2),
      jjAmount: (Math.random() * 5 + 0.5).toFixed(2),
      openPct: ((Math.random() - 0.4) * 10).toFixed(2),
      price: (Math.random() * 50 + 5).toFixed(2),
      volume: (Math.random() * 100 + 10).toFixed(0),
      ztBoard: Math.random() > 0.5 ? Math.floor(Math.random() * 5) + 1 : 0,
    })
  }
  return stocks.sort((a, b) => Number(b.jjPct) - Number(a.jjPct))
}

// ========== 资金流向 ==========
export function generateZijinData() {
  const plates = [
    '汽车零部件', '人工智能', '半导体', '锂电池', '光伏', '机器人', '军工', '医药',
    '华为概念', '风电', '储能', '数字经济', '消费电子', '5G', '特高压',
  ]
  return plates.map((name) => ({
    name,
    mainIn: (Math.random() * 50 - 10).toFixed(2),
    superIn: (Math.random() * 20 - 5).toFixed(2),
    totalIn: (Math.random() * 60 - 15).toFixed(2),
    pct: (Math.random() * 4 - 2).toFixed(2),
    topStocks: Array.from({ length: 3 }, (_, i) => ({
      code: String(2000 + i).padStart(6, '0'),
      name: ['龙头A', '龙头B', '龙头C'][i],
      pct: (Math.random() * 8 + 2).toFixed(2),
      flow: (Math.random() * 10 + 1).toFixed(2),
    })),
  }))
}

// ========== 复盘数据 ==========
export function generateFupanData(date) {
  const d = date || dayjs().format('YYYY-MM-DD')
  return {
    date: d,
    ztCount: 48,
    dtCount: 7,
    zbCount: 12,
    fbCount: 8,
    sentiment: [
      { time: '09:30', value: 65 },
      { time: '10:00', value: 72 },
      { time: '10:30', value: 68 },
      { time: '11:00', value: 75 },
      { time: '11:30', value: 70 },
      { time: '13:00', value: 78 },
      { time: '13:30', value: 82 },
      { time: '14:00', value: 76 },
      { time: '14:30', value: 80 },
      { time: '15:00', value: 85 },
    ],
    hotPlates: [
      { name: '汽车零部件', ztCount: 8, leaderName: '天龙股份', leaderCode: '001234' },
      { name: '人工智能', ztCount: 6, leaderName: '科大智能', leaderCode: '001235' },
      { name: '半导体', ztCount: 5, leaderName: '华立股份', leaderCode: '003456' },
      { name: '机器人', ztCount: 4, leaderName: '海得控制', leaderCode: '005678' },
      { name: '华为概念', ztCount: 4, leaderName: '深圳华强', leaderCode: '013456' },
    ],
    topZt: generateLianbanData().slice(0, 10),
    topAmount: Array.from({ length: 10 }, (_, i) => ({
      code: String(3000 + i).padStart(6, '0'),
      name: ['天龙股份', '中恒电气', '华立股份', '京华激光', '海得控制'][i % 5],
      amount: (Math.random() * 50 + 10).toFixed(2),
      pct: (Math.random() * 6 + 4).toFixed(2),
    })),
  }
}
