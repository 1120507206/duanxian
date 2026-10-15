import NodeCache from 'node-cache'

const TTL_CONFIG = {
  indices: 5,
  sentiment: 10,
  lianban: 30,
  longhu: 300,
  longhuDetail: 300,
  jingjia: 60,
  zijin: 30,
  quotes: 3,
  kline: 600,
  fupan: 300,
  // 涨停播报存的是 stale 副本，新鲜度由 ztliveService 的 5s 窗口判定
  ztlive: 60,
}

const cache = new NodeCache({ checkperiod: 10 })

export function get(key) {
  return cache.get(key)
}

export function set(key, data, category = 'indices') {
  const ttl = TTL_CONFIG[category] || 60
  cache.set(key, data, ttl)
}

export function del(key) {
  cache.del(key)
}

export function flush() {
  cache.flushAll()
}

export function getStats() {
  return cache.getStats()
}
