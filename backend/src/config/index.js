import 'dotenv/config'

export default {
  port: Number(process.env.PORT) || 8080,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  ztliveSourceUrl: process.env.ZTLIVE_SOURCE_URL || 'https://ds.duanxianxia.com/vendor/stockdata/ztlive_all.json',
}
