/**
 * 短信验证码服务（可插拔驱动）。
 *
 * 为什么不写死某一家：手机号注册要真发短信，就必须有短信服务商账号 + 签名报备，
 * 这条路短则 1 天、长则一周（还常常要营业执照）。但它不该拖住整个账户体系的开发。
 * 所以这里做成驱动式：
 *
 *   SMS_DRIVER=console   默认。不真发，验证码写进日志；开 SMS_DEBUG=1 时接口直接回带，
 *                        本地联调不用等短信通道。
 *   SMS_DRIVER=tencent   腾讯云 SMS，填 SecretId/SecretKey/SDKAppId/签名/模板 ID 即用。
 *   SMS_DRIVER=webhook   POST {phone, code, purpose} 到你自己的中转地址。
 *                        用阿里云/华为云/自建网关、甚至「手机短信转发器」这类方案都可以走这条。
 *
 * 安全口径（这些不是可选装饰，是必做项）：
 * - 验证码只存哈希，不存明文 —— 数据库被拖走也不能直接登录。
 * - 60 秒重发冷却、单号码每日上限、单 IP 每日上限 —— 否则会被拿来当短信轰炸机，
 *   一条几分钱，被刷一次就是几百块，而且运营商会直接封你的签名。
 * - 校验次数上限 —— 6 位数字只有 100 万种组合，不限次数等于可爆破。
 * - 验证码一次有效，用掉即作废。
 */
import crypto from 'crypto'
import db from '../db/index.js'
import * as logger from '../utils/logger.js'

const CODE_TTL_MS = 5 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_VERIFY_ATTEMPTS = 5
const DAILY_LIMIT_PER_PHONE = 10
const DAILY_LIMIT_PER_IP = 40

const PHONE_RE = /^1[3-9]\d{9}$/

export function normalizePhone(raw) {
  const value = String(raw || '').replace(/[^\d]/g, '')
  return PHONE_RE.test(value) ? value : ''
}

function driver() {
  return String(process.env.SMS_DRIVER || 'console').toLowerCase()
}

function hashCode(phone, code) {
  return crypto.createHash('sha256').update(`${phone}:${code}:${process.env.SMS_HASH_SALT || 'dx-sms'}`).digest('hex')
}

function randomCode() {
  return String(crypto.randomInt(100000, 1000000))
}

function maskPhone(phone) {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
}

// ---------------------------------------------------------------- 发送驱动

async function sendViaConsole(phone, code, purpose) {
  logger.info('sms_code_console', { phone: maskPhone(phone), code, purpose })
  console.log(`\n[短信 console 驱动] ${phone} 的${purpose}验证码：${code}（5 分钟内有效）\n`)
  return { ok: true, driver: 'console' }
}

/**
 * 腾讯云 SMS（TC3-HMAC-SHA256）。
 * 按官方签名算法实现：拼规范请求 → 派生签名密钥 → 拼 Authorization 头。
 */
async function sendViaTencent(phone, code, purpose) {
  const secretId = process.env.TENCENT_SMS_SECRET_ID
  const secretKey = process.env.TENCENT_SMS_SECRET_KEY
  const sdkAppId = process.env.TENCENT_SMS_SDK_APP_ID
  const signName = process.env.TENCENT_SMS_SIGN_NAME
  const templateId = process.env.TENCENT_SMS_TEMPLATE_ID

  if (!secretId || !secretKey || !sdkAppId || !signName || !templateId) {
    logger.error('sms_tencent_misconfigured', { purpose })
    return { ok: false, error: '短信服务未配置完整（腾讯云 SMS）' }
  }

  const host = 'sms.tencentcloudapi.com'
  const service = 'sms'
  const action = 'SendSms'
  const version = '2021-01-11'
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)

  const payload = JSON.stringify({
    PhoneNumberSet: [`+86${phone}`],
    SmsSdkAppId: sdkAppId,
    SignName: signName,
    TemplateId: templateId,
    TemplateParamSet: [code, String(Math.round(CODE_TTL_MS / 60000))],
  })

  const canonicalRequest = [
    'POST',
    '/',
    '',
    `content-type:application/json\nhost:${host}\n`,
    'content-type;host',
    crypto.createHash('sha256').update(payload).digest('hex'),
  ].join('\n')

  const scope = `${date}/${service}/tc3_request`
  const stringToSign = [
    'TC3-HMAC-SHA256',
    timestamp,
    scope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n')

  const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest()
  const secretDate = hmac(`TC3${secretKey}`, date)
  const secretService = hmac(secretDate, service)
  const secretSigning = hmac(secretService, 'tc3_request')
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

  const authorization = [
    'TC3-HMAC-SHA256',
    `Credential=${secretId}/${scope}`,
    'SignedHeaders=content-type;host',
    `Signature=${signature}`,
  ].join(', ')

  try {
    const response = await fetch(`https://${host}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Host: host,
        'X-TC-Action': action,
        'X-TC-Version': version,
        'X-TC-Timestamp': String(timestamp),
        Authorization: authorization,
      },
      body: payload,
    })
    const result = await response.json()
    const sendStatus = result?.Response?.SendStatusSet?.[0]
    if (sendStatus?.Code && sendStatus.Code !== 'Ok') {
      logger.error('sms_tencent_failed', { code: sendStatus.Code, message: sendStatus.Message })
      return { ok: false, error: '短信发送失败，请稍后重试' }
    }
    logger.info('sms_sent', { phone: maskPhone(phone), purpose, driver: 'tencent' })
    return { ok: true, driver: 'tencent' }
  } catch (error) {
    logger.error('sms_tencent_error', { message: error.message })
    return { ok: false, error: '短信服务暂不可用，请稍后重试' }
  }
}

async function sendViaWebhook(phone, code, purpose) {
  const url = process.env.SMS_WEBHOOK_URL
  if (!url) {
    logger.error('sms_webhook_misconfigured', { purpose })
    return { ok: false, error: '短信服务未配置（webhook）' }
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.SMS_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.SMS_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify({ phone, code, purpose, ttlSeconds: Math.round(CODE_TTL_MS / 1000) }),
    })
    if (!response.ok) throw new Error(`webhook ${response.status}`)
    logger.info('sms_sent', { phone: maskPhone(phone), purpose, driver: 'webhook' })
    return { ok: true, driver: 'webhook' }
  } catch (error) {
    logger.error('sms_webhook_error', { message: error.message })
    return { ok: false, error: '短信服务暂不可用，请稍后重试' }
  }
}

const DRIVERS = {
  console: sendViaConsole,
  tencent: sendViaTencent,
  webhook: sendViaWebhook,
}

// ---------------------------------------------------------------- 对外接口

/**
 * 发送验证码。
 * @returns {{ ok: boolean, error?: string, debugCode?: string }}
 *   debugCode 只在 console 驱动且开了 SMS_DEBUG 时返回，方便本地跑通全流程。
 */
export async function sendCode({ phone, purpose = 'register', ip = '' } = {}) {
  const normalized = normalizePhone(phone)
  if (!normalized) return { ok: false, error: '手机号格式不正确' }

  const now = Date.now()
  const dayStart = now - 24 * 60 * 60 * 1000

  // 重发冷却：同一号码 60 秒内只发一次
  const last = db.prepare('SELECT created_at FROM sms_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1').get(normalized)
  if (last && now - last.created_at < RESEND_COOLDOWN_MS) {
    return { ok: false, error: '发送太频繁，请 60 秒后再试' }
  }

  const phoneCount = db.prepare('SELECT COUNT(*) AS c FROM sms_codes WHERE phone = ? AND created_at >= ?').get(normalized, dayStart).c
  if (phoneCount >= DAILY_LIMIT_PER_PHONE) {
    return { ok: false, error: '今日发送次数已达上限，请明天再试' }
  }

  if (ip) {
    const ipCount = db.prepare('SELECT COUNT(*) AS c FROM sms_codes WHERE ip = ? AND created_at >= ?').get(ip, dayStart).c
    if (ipCount >= DAILY_LIMIT_PER_IP) {
      logger.warn('sms_ip_rate_limited', { ip })
      return { ok: false, error: '发送过于频繁，请稍后再试' }
    }
  }

  const code = randomCode()
  const send = DRIVERS[driver()] || sendViaConsole
  const sent = await send(normalized, code, purpose)
  if (!sent.ok) return sent

  db.prepare(`
    INSERT INTO sms_codes (phone, code_hash, purpose, expires_at, attempts, ip, created_at)
    VALUES (?, ?, ?, ?, 0, ?, ?)
  `).run(normalized, hashCode(normalized, code), purpose, now + CODE_TTL_MS, String(ip || '').slice(0, 64), now)

  const debug = driver() === 'console' && String(process.env.SMS_DEBUG || '') === '1'
  return { ok: true, sent: true, debugCode: debug ? code : undefined }
}

/**
 * 校验并消费验证码。
 * 校验失败会累加 attempts，超过上限直接作废这个码 —— 6 位数字空间太小，必须防爆破。
 */
export function verifyCode({ phone, code, purpose = 'register' } = {}) {
  const normalized = normalizePhone(phone)
  const input = String(code || '').trim()
  if (!normalized || !/^\d{6}$/.test(input)) return { ok: false, error: '验证码格式不正确' }

  const now = Date.now()
  const row = db.prepare(`
    SELECT * FROM sms_codes
    WHERE phone = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > ?
    ORDER BY created_at DESC LIMIT 1
  `).get(normalized, purpose, now)

  if (!row) return { ok: false, error: '验证码不存在或已过期，请重新获取' }

  if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
    db.prepare('UPDATE sms_codes SET consumed_at = ? WHERE id = ?').run(now, row.id)
    return { ok: false, error: '验证码错误次数过多，请重新获取' }
  }

  // 定时安全比较：hashCode 是定长 hex，长度一致才比
  const expected = hashCode(normalized, input)
  const expectedBuf = Buffer.from(expected, 'utf8')
  const actualBuf = Buffer.from(row.code_hash, 'utf8')
  const matched = expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf)

  if (!matched) {
    db.prepare('UPDATE sms_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id)
    return { ok: false, error: '验证码不正确' }
  }

  db.prepare('UPDATE sms_codes SET consumed_at = ? WHERE id = ?').run(now, row.id)
  return { ok: true }
}

/** 清理过期验证码，启动和每天各跑一次，别让这张表无限长 */
export function purgeExpiredCodes() {
  const info = db.prepare('DELETE FROM sms_codes WHERE expires_at < ?').run(Date.now() - 24 * 60 * 60 * 1000)
  if (info.changes) logger.info('sms_codes_purged', { removed: info.changes })
  return info.changes
}

export function describeDriver() {
  return {
    driver: driver(),
    debug: String(process.env.SMS_DEBUG || '') === '1',
    ready: driver() !== 'console',
  }
}

export { CODE_TTL_MS, RESEND_COOLDOWN_MS }
