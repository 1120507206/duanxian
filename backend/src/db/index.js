import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'duanxian.db')

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
`)

export default db
