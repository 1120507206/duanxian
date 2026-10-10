import db from './index.js'

const today = new Date().toISOString().split('T')[0]

// ========== 真实A股股票数据 ==========
const stocks = [
  { code: '600519', name: '贵州茅台', industry: '白酒', marketVal: 21800 },
  { code: '300750', name: '宁德时代', industry: '锂电池', marketVal: 8900 },
  { code: '002594', name: '比亚迪', industry: '新能源汽车', marketVal: 7200 },
  { code: '601012', name: '隆基绿能', industry: '光伏', marketVal: 1800 },
  { code: '300274', name: '阳光电源', industry: '储能', marketVal: 1600 },
  { code: '603259', name: '药明康德', industry: '医药', marketVal: 1400 },
  { code: '688981', name: '中芯国际', industry: '半导体', marketVal: 3800 },
  { code: '001234', name: '天龙股份', industry: '汽车零部件', marketVal: 45 },
  { code: '002345', name: '中恒电气', industry: '充电桩', marketVal: 38 },
  { code: '003456', name: '华立股份', industry: '智能家居', marketVal: 52 },
  { code: '004567', name: '京华激光', industry: '光刻机', marketVal: 35 },
  { code: '005678', name: '海得控制', industry: '机器人', marketVal: 48 },
  { code: '006789', name: '日发精机', industry: '工业母机', marketVal: 42 },
  { code: '007890', name: '南京公用', industry: '天然气', marketVal: 55 },
  { code: '008901', name: '世嘉科技', industry: '6G概念', marketVal: 32 },
  { code: '009012', name: '恒银科技', industry: '数字货币', marketVal: 28 },
  { code: '010123', name: '庚星股份', industry: '电子烟', marketVal: 22 },
  { code: '011234', name: '东晶电子', industry: '元器件', marketVal: 30 },
  { code: '012345', name: '惠威科技', industry: '智能音箱', marketVal: 25 },
  { code: '013456', name: '深圳华强', industry: '华为概念', marketVal: 68 },
  { code: '014567', name: '上海凤凰', industry: '自行车', marketVal: 20 },
  { code: '015678', name: '通达动力', industry: '减速器', marketVal: 33 },
  { code: '016789', name: '凯众股份', industry: '汽车热管理', marketVal: 28 },
  { code: '017890', name: '科大智能', industry: '人工智能', marketVal: 95 },
  { code: '018901', name: '竞业达', industry: '数字经济', marketVal: 40 },
  { code: '019012', name: '英飞拓', industry: '5G', marketVal: 55 },
  { code: '020123', name: '特力A', industry: '特高压', marketVal: 38 },
]

// ========== 大盘指数 ==========
const insertIndices = db.prepare(`INSERT OR REPLACE INTO market_indices (code, name, value, change_val, pct) VALUES (?, ?, ?, ?, ?)`)
const indices = [
  ['000001', '上证指数', 3368.52, 0.78, 0.02],
  ['399001', '深证成指', 10876.34, 1.23, 0.01],
  ['399006', '创业板指', 2258.78, -0.45, -0.02],
  ['000688', '科创50', 1032.15, 2.15, 0.21],
]
for (const idx of indices) insertIndices.run(...idx)

// ========== 市场情绪 ==========
const insertSentiment = db.prepare(`INSERT OR REPLACE INTO market_sentiment (date, zt_count, dt_count, zt_ratio, kuiqian, main_flow, lianban_height, up_count, down_count, turnover) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
insertSentiment.run(today, 48, 7, 87, -2.3, 23.5, 7, 2156, 1823, 8921)

// ========== 股票基础表 ==========
const insertStock = db.prepare(`INSERT OR REPLACE INTO stocks (code, name, industry, market_val) VALUES (?, ?, ?, ?)`)
for (const s of stocks) insertStock.run(s.code, s.name, s.industry, s.marketVal)

// ========== 连板数据 ==========
const insertLianban = db.prepare(`INSERT OR REPLACE INTO lianban (date, code, name, industry, board, price, pct, turnover, fengdan, market_val, first_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
const lianbanData = [
  { code: '001234', name: '天龙股份', industry: '汽车零部件', board: 7, price: 28.56, pct: 10.02, turnover: 12.5, fengdan: 3.2, marketVal: 45, firstTime: '09:25' },
  { code: '005678', name: '海得控制', industry: '机器人', board: 6, price: 18.92, pct: 9.98, turnover: 8.3, fengdan: 1.8, marketVal: 48, firstTime: '09:30' },
  { code: '016789', name: '凯众股份', industry: '汽车热管理', board: 6, price: 22.15, pct: 10.01, turnover: 5.6, fengdan: 1.5, marketVal: 28, firstTime: '09:32' },
  { code: '003456', name: '华立股份', industry: '智能家居', board: 5, price: 15.78, pct: 9.97, turnover: 6.8, fengdan: 2.1, marketVal: 52, firstTime: '09:28' },
  { code: '013456', name: '深圳华强', industry: '华为概念', board: 5, price: 32.45, pct: 10.00, turnover: 15.2, fengdan: 2.8, marketVal: 68, firstTime: '09:35' },
  { code: '017890', name: '科大智能', industry: '人工智能', board: 5, price: 45.60, pct: 10.03, turnover: 18.9, fengdan: 4.5, marketVal: 95, firstTime: '09:25' },
  { code: '002345', name: '中恒电气', industry: '充电桩', board: 4, price: 12.34, pct: 9.96, turnover: 4.2, fengdan: 0.9, marketVal: 38, firstTime: '09:40' },
  { code: '004567', name: '京华激光', industry: '光刻机', board: 4, price: 25.80, pct: 9.99, turnover: 7.1, fengdan: 1.6, marketVal: 35, firstTime: '09:33' },
  { code: '006789', name: '日发精机', industry: '工业母机', board: 4, price: 19.56, pct: 10.01, turnover: 5.8, fengdan: 1.3, marketVal: 42, firstTime: '09:28' },
  { code: '007890', name: '南京公用', industry: '天然气', board: 3, price: 8.92, pct: 9.94, turnover: 3.5, fengdan: 0.7, marketVal: 55, firstTime: '09:45' },
  { code: '008901', name: '世嘉科技', industry: '6G概念', board: 3, price: 11.23, pct: 10.05, turnover: 2.8, fengdan: 0.6, marketVal: 32, firstTime: '09:38' },
  { code: '009012', name: '恒银科技', industry: '数字货币', board: 3, price: 9.87, pct: 9.98, turnover: 3.1, fengdan: 0.5, marketVal: 28, firstTime: '09:50' },
  { code: '010123', name: '庚星股份', industry: '电子烟', board: 2, price: 6.78, pct: 10.08, turnover: 1.8, fengdan: 0.4, marketVal: 22, firstTime: '10:05' },
  { code: '011234', name: '东晶电子', industry: '元器件', board: 2, price: 14.56, pct: 9.95, turnover: 2.5, fengdan: 0.5, marketVal: 30, firstTime: '09:55' },
  { code: '012345', name: '惠威科技', industry: '智能音箱', board: 2, price: 16.34, pct: 10.02, turnover: 3.2, fengdan: 0.8, marketVal: 25, firstTime: '10:12' },
]
for (const item of lianbanData) insertLianban.run(today, item.code, item.name, item.industry, item.board, item.price, item.pct, item.turnover, item.fengdan, item.marketVal, item.firstTime)

// ========== 龙虎榜数据 ==========
const insertLonghu = db.prepare(`INSERT OR REPLACE INTO longhu (date, code, name, reason, price, pct, turnover, buy_total, sell_total, net_flow) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
const insertLonghuDetail = db.prepare(`INSERT INTO longhu_detail (longhu_id, side, trader_name, dept_name, amount) VALUES (?, ?, ?, ?, ?)`)

const longhuData = [
  { code: '001234', name: '天龙股份', reason: '日涨幅偏离值达7%', buyList: [{ name: '赵老哥', dept: '中信证券上海分公司', amount: 5200 }, { name: '章盟主', dept: '华泰证券总部', amount: 3800 }, { name: '方新侠', dept: '国泰君安上海分公司', amount: 2900 }], sellList: [{ name: '炒股养家', dept: '东方财富拉萨团结路', amount: 1500 }, { name: '孙哥', dept: '东方财富拉萨东环路', amount: 1200 }] },
  { code: '005678', name: '海得控制', reason: '连续三日涨幅偏离值累计达20%', buyList: [{ name: '章盟主', dept: '华泰证券总部', amount: 4500 }, { name: '作手新一', dept: '中国银河绍兴', amount: 3200 }], sellList: [{ name: '小鳄鱼', dept: '申万宏源上海分公司', amount: 1800 }] },
  { code: '003456', name: '华立股份', reason: '日换手率达20%', buyList: [{ name: '赵老哥', dept: '中信证券上海分公司', amount: 2800 }, { name: '方新侠', dept: '国泰君安上海分公司', amount: 2100 }, { name: '作手新一', dept: '中国银河绍兴', amount: 1800 }], sellList: [{ name: '湖州劳动路', dept: '广发证券上海分公司', amount: 2000 }, { name: '炒股养家', dept: '东方财富拉萨团结路', amount: 1600 }] },
  { code: '013456', name: '深圳华强', reason: '日涨幅偏离值达7%', buyList: [{ name: '章盟主', dept: '华泰证券总部', amount: 6800 }, { name: '赵老哥', dept: '中信证券上海分公司', amount: 4200 }], sellList: [{ name: '孙哥', dept: '东方财富拉萨东环路', amount: 2500 }, { name: '小鳄鱼', dept: '申万宏源上海分公司', amount: 1800 }, { name: '炒股养家', dept: '东方财富拉萨团结路', amount: 1200 }] },
  { code: '017890', name: '科大智能', reason: '日涨幅偏离值达7%', buyList: [{ name: '方新侠', dept: '国泰君安上海分公司', amount: 5500 }, { name: '章盟主', dept: '华泰证券总部', amount: 4800 }, { name: '作手新一', dept: '中国银河绍兴', amount: 3500 }, { name: '赵老哥', dept: '中信证券上海分公司', amount: 2800 }], sellList: [{ name: '湖州劳动路', dept: '广发证券上海分公司', amount: 2200 }] },
  { code: '006789', name: '日发精机', reason: '连续三日涨幅偏离值累计达20%', buyList: [{ name: '作手新一', dept: '中国银河绍兴', amount: 3200 }, { name: '小鳄鱼', dept: '申万宏源上海分公司', amount: 2600 }], sellList: [{ name: '章盟主', dept: '华泰证券总部', amount: 2400 }, { name: '赵老哥', dept: '中信证券上海分公司', amount: 1900 }] },
  { code: '004567', name: '京华激光', reason: '日涨幅偏离值达7%', buyList: [{ name: '孙哥', dept: '东方财富拉萨东环路', amount: 2100 }, { name: '炒股养家', dept: '东方财富拉萨团结路', amount: 1800 }], sellList: [{ name: '赵老哥', dept: '中信证券上海分公司', amount: 1200 }] },
  { code: '007890', name: '南京公用', reason: '日换手率达20%', buyList: [{ name: '小鳄鱼', dept: '申万宏源上海分公司', amount: 1600 }, { name: '方新侠', dept: '国泰君安上海分公司', amount: 1400 }, { name: '湖州劳动路', dept: '广发证券上海分公司', amount: 1200 }], sellList: [{ name: '作手新一', dept: '中国银河绍兴', amount: 2000 }, { name: '章盟主', dept: '华泰证券总部', amount: 1500 }] },
]
for (const item of longhuData) {
  const buyTotal = item.buyList.reduce((s, b) => s + b.amount, 0)
  const sellTotal = item.sellList.reduce((s, b) => s + b.amount, 0)
  const price = (Math.random() * 50 + 5).toFixed(2)
  const pct = (Math.random() * 6 + 4).toFixed(2)
  const turnover = (Math.random() * 30 + 5).toFixed(2)
  const result = insertLonghu.run(today, item.code, item.name, item.reason, price, pct, turnover, buyTotal, sellTotal, buyTotal - sellTotal)
  const longhuId = result.lastInsertRowid
  for (const b of item.buyList) insertLonghuDetail.run(longhuId, 'buy', b.name, b.dept, b.amount)
  for (const s of item.sellList) insertLonghuDetail.run(longhuId, 'sell', s.name, s.dept, s.amount)
}

// ========== 集合竞价数据 ==========
const insertJingjia = db.prepare(`INSERT OR REPLACE INTO jingjia (date, code, name, jj_pct, jj_amount, open_pct, price, volume, zt_board) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
const jingjiaNames = ['天龙股份', '中恒电气', '华立股份', '京华激光', '海得控制', '日发精机', '南京公用', '世嘉科技', '恒银科技', '庚星股份', '东晶电子', '惠威科技', '深圳华强', '上海凤凰', '通达动力', '凯众股份', '科大智能', '竞业达', '英飞拓', '特力A', '贵州茅台', '宁德时代', '比亚迪', '隆基绿能', '阳光电源', '药明康德', '中芯国际', '天龙股份A', '中恒电气A', '华立股份A']
for (let i = 0; i < 30; i++) {
  const jjPct = ((Math.random() - 0.3) * 12).toFixed(2)
  const jjAmount = (Math.random() * 5 + 0.5).toFixed(2)
  const openPct = ((Math.random() - 0.4) * 10).toFixed(2)
  const price = (Math.random() * 50 + 5).toFixed(2)
  const volume = Math.floor(Math.random() * 100 + 10)
  const ztBoard = Math.random() > 0.5 ? Math.floor(Math.random() * 5) + 1 : 0
  insertJingjia.run(today, String(600000 + i), jingjiaNames[i], jjPct, jjAmount, openPct, price, volume, ztBoard)
}

// ========== 资金流向数据 ==========
const insertZijin = db.prepare(`INSERT OR REPLACE INTO zijin (date, plate_name, main_in, super_in, total_in, pct, leader_code, leader_name, leader_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
const plates = [
  { name: '汽车零部件', mainIn: 28.5, superIn: 15.2, totalIn: 38.6, pct: 2.8, leaderCode: '001234', leaderName: '天龙股份', leaderPct: 10.02 },
  { name: '人工智能', mainIn: 22.3, superIn: 12.8, totalIn: 30.5, pct: 2.1, leaderCode: '017890', leaderName: '科大智能', leaderPct: 10.03 },
  { name: '半导体', mainIn: 18.6, superIn: 9.5, totalIn: 25.2, pct: 1.8, leaderCode: '688981', leaderName: '中芯国际', leaderPct: 3.45 },
  { name: '锂电池', mainIn: 15.2, superIn: 8.1, totalIn: 20.8, pct: 1.5, leaderCode: '300750', leaderName: '宁德时代', leaderPct: 2.15 },
  { name: '光伏', mainIn: -5.3, superIn: -2.8, totalIn: -8.6, pct: -0.8, leaderCode: '601012', leaderName: '隆基绿能', leaderPct: -1.23 },
  { name: '机器人', mainIn: 12.8, superIn: 6.5, totalIn: 16.2, pct: 1.2, leaderCode: '005678', leaderName: '海得控制', leaderPct: 9.98 },
  { name: '军工', mainIn: -3.2, superIn: -1.5, totalIn: -5.8, pct: -0.5, leaderCode: '020123', leaderName: '特力A', leaderPct: -0.56 },
  { name: '医药', mainIn: 8.9, superIn: 4.2, totalIn: 11.5, pct: 0.9, leaderCode: '603259', leaderName: '药明康德', leaderPct: 2.35 },
  { name: '华为概念', mainIn: 20.1, superIn: 11.3, totalIn: 28.4, pct: 2.3, leaderCode: '013456', leaderName: '深圳华强', leaderPct: 10.00 },
  { name: '风电', mainIn: -8.6, superIn: -4.2, totalIn: -12.8, pct: -1.1, leaderCode: '018901', leaderName: '竞业达', leaderPct: -2.15 },
  { name: '储能', mainIn: 6.5, superIn: 3.1, totalIn: 8.8, pct: 0.7, leaderCode: '300274', leaderName: '阳光电源', leaderPct: 1.85 },
  { name: '数字经济', mainIn: 14.2, superIn: 7.8, totalIn: 19.5, pct: 1.6, leaderCode: '018901', leaderName: '竞业达', leaderPct: 4.56 },
  { name: '消费电子', mainIn: 10.5, superIn: 5.6, totalIn: 14.2, pct: 1.1, leaderCode: '011234', leaderName: '东晶电子', leaderPct: 9.95 },
  { name: '5G', mainIn: -2.1, superIn: -1.1, totalIn: -3.5, pct: -0.3, leaderCode: '019012', leaderName: '英飞拓', leaderPct: -0.34 },
  { name: '特高压', mainIn: 5.8, superIn: 2.9, totalIn: 7.6, pct: 0.6, leaderCode: '020123', leaderName: '特力A', leaderPct: 2.15 },
]
for (const p of plates) insertZijin.run(today, p.name, p.mainIn, p.superIn, p.totalIn, p.pct, p.leaderCode, p.leaderName, p.leaderPct)

// ========== 复盘数据 ==========
const insertFupan = db.prepare(`INSERT OR REPLACE INTO fupan (date, zt_count, dt_count, zb_count, fb_count) VALUES (?, ?, ?, ?, ?)`)
insertFupan.run(today, 48, 7, 12, 8)

const insertFupanSentiment = db.prepare(`INSERT OR REPLACE INTO fupan_sentiment (date, time, value) VALUES (?, ?, ?)`)
const sentimentData = [
  ['09:30', 65], ['10:00', 72], ['10:30', 68], ['11:00', 75],
  ['11:30', 70], ['13:00', 78], ['13:30', 82], ['14:00', 76],
  ['14:30', 80], ['15:00', 85],
]
for (const [time, value] of sentimentData) insertFupanSentiment.run(today, time, value)

const insertFupanHotPlate = db.prepare(`INSERT OR REPLACE INTO fupan_hot_plate (date, plate_name, zt_count, leader_name, leader_code) VALUES (?, ?, ?, ?, ?)`)
const hotPlates = [
  ['汽车零部件', 8, '天龙股份', '001234'],
  ['人工智能', 6, '科大智能', '017890'],
  ['半导体', 5, '华立股份', '003456'],
  ['机器人', 4, '海得控制', '005678'],
  ['华为概念', 4, '深圳华强', '013456'],
]
for (const [name, count, leader, code] of hotPlates) insertFupanHotPlate.run(today, name, count, leader, code)

// ========== K线数据 ==========
const insertKline = db.prepare(`INSERT OR REPLACE INTO kline (code, type, time, open, close, high, low, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
const klineCodes = ['001234', '600519', '300750', '000001']
for (const code of klineCodes) {
  let price = code === '600519' ? 1680 : code === '300750' ? 210 : 10 + Math.random() * 20
  for (let i = 0; i < 60; i++) {
    price += (Math.random() - 0.48) * (price * 0.02)
    const open = price
    const close = price + (Math.random() - 0.5) * (price * 0.01)
    const high = Math.max(open, close) + Math.random() * price * 0.005
    const low = Math.min(open, close) - Math.random() * price * 0.005
    const day = new Date()
    day.setDate(day.getDate() - (59 - i))
    const dateStr = day.toISOString().split('T')[0]
    insertKline.run(code, 'day', dateStr, open.toFixed(2), close.toFixed(2), high.toFixed(2), low.toFixed(2), Math.floor(Math.random() * 50000 + 5000))
  }
}

console.log('[数据库] 种子数据初始化完成')
console.log(`[数据库] 日期: ${today}`)
console.log(`[数据库] 股票数: ${stocks.length}`)
console.log(`[数据库] 连板数: ${lianbanData.length}`)
console.log(`[数据库] 龙虎榜: ${longhuData.length}`)
console.log(`[数据库] 竞价数: 30`)
console.log(`[数据库] 板块数: ${plates.length}`)
