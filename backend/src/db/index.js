import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// DB_PATH 允许测试/演练使用临时库，避免测试直接写生产数据目录。
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'duanxian.db')

// 确保 data 目录存在
import fs from 'fs'
const dataDir = path.dirname(DB_PATH)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ========== 建表 ==========
db.exec(`
  CREATE TABLE IF NOT EXISTS stocks (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    industry TEXT,
    market_val REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS market_indices (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    value REAL DEFAULT 0,
    change_val REAL DEFAULT 0,
    pct REAL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS market_sentiment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    zt_count INTEGER DEFAULT 0,
    dt_count INTEGER DEFAULT 0,
    zt_ratio REAL DEFAULT 0,
    kuiqian REAL DEFAULT 0,
    main_flow REAL DEFAULT 0,
    lianban_height INTEGER DEFAULT 0,
    up_count INTEGER DEFAULT 0,
    down_count INTEGER DEFAULT 0,
    turnover REAL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS lianban (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    industry TEXT,
    board INTEGER NOT NULL,
    price REAL DEFAULT 0,
    pct REAL DEFAULT 0,
    turnover REAL DEFAULT 0,
    fengdan REAL DEFAULT 0,
    market_val REAL DEFAULT 0,
    first_time TEXT,
    UNIQUE(date, code)
  );

  CREATE TABLE IF NOT EXISTS longhu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    reason TEXT,
    price REAL DEFAULT 0,
    pct REAL DEFAULT 0,
    turnover REAL DEFAULT 0,
    buy_total REAL DEFAULT 0,
    sell_total REAL DEFAULT 0,
    net_flow REAL DEFAULT 0,
    UNIQUE(date, code)
  );

  CREATE TABLE IF NOT EXISTS longhu_detail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    longhu_id INTEGER NOT NULL REFERENCES longhu(id),
    side TEXT NOT NULL CHECK(side IN ('buy','sell')),
    trader_name TEXT,
    dept_name TEXT,
    amount REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS jingjia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    jj_pct REAL DEFAULT 0,
    jj_amount REAL DEFAULT 0,
    open_pct REAL DEFAULT 0,
    price REAL DEFAULT 0,
    volume REAL DEFAULT 0,
    zt_board INTEGER DEFAULT 0,
    UNIQUE(date, code)
  );

  CREATE TABLE IF NOT EXISTS zijin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    plate_name TEXT NOT NULL,
    main_in REAL DEFAULT 0,
    super_in REAL DEFAULT 0,
    total_in REAL DEFAULT 0,
    pct REAL DEFAULT 0,
    leader_code TEXT,
    leader_name TEXT,
    leader_pct REAL,
    UNIQUE(date, plate_name)
  );

  CREATE TABLE IF NOT EXISTS zixuan (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    added_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fupan (
    date TEXT PRIMARY KEY,
    zt_count INTEGER DEFAULT 0,
    dt_count INTEGER DEFAULT 0,
    zb_count INTEGER DEFAULT 0,
    fb_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS fupan_sentiment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    value REAL DEFAULT 0,
    UNIQUE(date, time)
  );

  CREATE TABLE IF NOT EXISTS fupan_hot_plate (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    plate_name TEXT NOT NULL,
    zt_count INTEGER DEFAULT 0,
    leader_name TEXT,
    leader_code TEXT,
    UNIQUE(date, plate_name)
  );

  CREATE TABLE IF NOT EXISTS kline (
    code TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'day',
    time TEXT NOT NULL,
    open REAL DEFAULT 0,
    close REAL DEFAULT 0,
    high REAL DEFAULT 0,
    low REAL DEFAULT 0,
    volume INTEGER DEFAULT 0,
    UNIQUE(code, type, time)
  );

  -- ========== 用户体系（匿名设备 + 激活码） ==========
  -- 设计取舍：不采集手机号 / 邮箱等个人信息，只用一个前端生成的匿名 device_id 标识设备。
  -- 好处是无需短信签名备案、无需隐私政策备案，当天即可上线；
  -- 代价是换设备 / 清缓存会丢会员身份，因此用「激活码可重复绑定」来兜底（见 userService.activate）。
  -- 时间统一用 INTEGER 毫秒时间戳：expires_at 需要做大小比较，整数比 datetime 文本更省事。

  CREATE TABLE IF NOT EXISTS app_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL UNIQUE,
    plan TEXT,
    expires_at INTEGER,
    channel TEXT,
    last_code TEXT,
    activation_count INTEGER DEFAULT 0,
    first_user_agent TEXT,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  );

  -- 激活码即「商品」：先批量生成，用户付款后人工/半自动发一个未使用的码。
  -- channel 用于记录这个码卖给了哪个分销渠道，便于按渠道结算分成。
  CREATE TABLE IF NOT EXISTS activation_codes (
    code TEXT PRIMARY KEY,
    plan TEXT NOT NULL,
    duration_days INTEGER NOT NULL,
    channel TEXT,
    batch TEXT,
    status TEXT NOT NULL DEFAULT 'unused',
    used_by_device TEXT,
    used_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_activation_codes_status
    ON activation_codes(status, channel);

  -- 埋点：没有它，推广出去也不知道人从哪来、留了几个。
  -- 只存设备维度的事实，不做用户画像；meta 存 JSON 字符串（如 { plate: '半导体' }）。
  CREATE TABLE IF NOT EXISTS app_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT,
    event TEXT NOT NULL,
    channel TEXT,
    path TEXT,
    meta TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_app_events_event_time
    ON app_events(event, created_at);

  CREATE INDEX IF NOT EXISTS idx_app_events_device
    ON app_events(device_id, created_at);

  -- ========== 账户体系（手机号注册 + 密码登录 + 验证码登录） ==========
  -- 与 app_users 的关系：app_users 是「设备」维度（匿名也能统计渠道、留埋点），
  -- accounts 是「人」的维度（会员权益挂在这里，才能跨设备）。
  -- 注册时把当前设备的 account_id 回填，这样「渠道 → 注册 → 付费」整条归因链不断。

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    nickname TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    -- 会员权益挂在账户上，换设备/清浏览器缓存都不丢
    membership_plan TEXT,
    membership_expires_at INTEGER,
    -- 新人礼：注册送 30 天，一人只能领一次
    trial_granted INTEGER DEFAULT 0,
    trial_granted_at INTEGER,
    channel TEXT,
    register_device_id TEXT,
    register_ip TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_login_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_accounts_expires
    ON accounts(membership_expires_at);

  -- 短信验证码：只存哈希，落库的和用户收到的都不能明文长期留着
  CREATE TABLE IF NOT EXISTS sms_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'register',
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    attempts INTEGER DEFAULT 0,
    ip TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sms_codes_phone
    ON sms_codes(phone, created_at);

  -- 会话：用 DB 里的随机 token 而不是 JWT —— 单机 SQLite 规模下，
  -- 这样能在服务端直接踢掉某个会话（改密码、封号），也不用管密钥轮换。
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    device_id TEXT,
    user_agent TEXT,
    ip TEXT,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_account
    ON sessions(account_id);

  -- 付款订单：个人收款码没有回调，只能「用户说付了 → 你核对账单 → 手动开通」。
  -- pay_tag 是金额尾数（0.01~0.09），用来在收款记录里区分同一金额的多笔订单。
  CREATE TABLE IF NOT EXISTS payment_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT NOT NULL UNIQUE,
    account_id INTEGER REFERENCES accounts(id),
    device_id TEXT,
    plan TEXT NOT NULL,
    amount REAL NOT NULL,
    pay_tag REAL DEFAULT 0,
    pay_method TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    payer_note TEXT,
    remark TEXT,
    created_at INTEGER NOT NULL,
    confirmed_at INTEGER,
    reviewed_at INTEGER,
    reviewed_by TEXT,
    expires_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_payment_orders_status
    ON payment_orders(status, created_at);

  -- ========== 运营后台（管理员 + 审计） ==========
  -- 后台控制台把此前的 CLI 运维动作搬到了浏览器里，这带来一个新风险：
  -- 一个能被公网访问、又能改会员到期时间、又能重置任意账号密码的入口。
  -- 因此这里有两条硬约束：
  --   1. 后台账号必须由 CLI 显式创建（npm run admin init），代码里没有默认口令；
  --   2. 每一次写操作都落 admin_logs，事后能追责到人。
  -- 会话独立于前台 sessions 表：前台 token 泄露不等于后台被攻破。

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    last_login_at INTEGER,
    last_login_ip TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    user_agent TEXT,
    ip TEXT,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin
    ON admin_sessions(admin_id);

  -- 审计日志：只追加，不提供修改/删除接口（连后台也不给），
  -- 否则「能改日志的后台」等于没有日志。
  CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER,
    admin_name TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    detail TEXT,
    ip TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_admin_logs_time
    ON admin_logs(created_at);

  CREATE INDEX IF NOT EXISTS idx_admin_logs_target
    ON admin_logs(target_type, target_id);
`)

/**
 * 幂等加列。
 *
 * CREATE TABLE IF NOT EXISTS 不会给「已存在的表」补新列，直接从设备体系升级到
 * 账户体系时会缺字段。这里按 PRAGMA 结果判断，重复启动也不会报错。
 */
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all()
  if (columns.some((col) => col.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
}

// app_users 补账户外键：设备归属于哪个账号（未登录时为空）
ensureColumn('app_users', 'account_id', 'account_id INTEGER REFERENCES accounts(id)')
ensureColumn('app_users', 'phone', 'phone TEXT')

// 激活码与埋点同样要能追溯到「人」，否则渠道分成和订单对账对不上
ensureColumn('activation_codes', 'used_by_account', 'used_by_account INTEGER REFERENCES accounts(id)')
ensureColumn('app_events', 'account_id', 'account_id INTEGER REFERENCES accounts(id)')

export default db
