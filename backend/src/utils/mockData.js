// 后端模拟数据工具

export function randomPct(base = 0, range = 10) {
  return ((Math.random() - 0.5) * range + base).toFixed(2)
}

export function randomAmount(min = 1, max = 50) {
  return (Math.random() * (max - min) + min).toFixed(2)
}

export function randomCode() {
  return String(100000 + Math.floor(Math.random() * 900000))
}

export const stockNames = [
  '天龙股份','中恒电气','华立股份','京华激光','海得控制','日发精机',
  '南京公用','世嘉科技','恒银科技','庚星股份','东晶电子','惠威科技',
  '深圳华强','上海凤凰','通达动力','凯众股份','科大智能','贵州茅台',
  '宁德时代','比亚迪','隆基绿能','阳光电源','药明康德','中芯国际',
]

export const industries = [
  '汽车零部件','充电桩','智能家居','光刻机','机器人','工业母机',
  '天然气','6G概念','数字货币','电子烟','元器件','智能音箱',
  '华为概念','自行车','减速器','汽车热管理','人工智能','半导体',
]

export const youziNames = [
  '赵老哥','章盟主','方新侠','炒股养家','作手新一','孙哥','小鳄鱼','湖州劳动路',
]

export const deptNames = [
  '中信证券上海分公司','华泰证券总部','国泰君安上海分公司',
  '东方财富拉萨团结路','东方财富拉萨东环路','中国银河绍兴',
  '申万宏源上海分公司','广发证券上海分公司',
]
