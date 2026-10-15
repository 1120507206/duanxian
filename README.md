# 短线侠

一个面向 A 股短线交易场景的前后端分离项目，当前包含首页、连板排行、龙虎榜、集合竞价、资金流向、自选股、每日复盘等页面。

## 当前技术栈

前端：

- Vue 3
- Vite
- Pinia
- Element Plus
- ECharts
- Tailwind CSS

后端：

- Node.js
- Express
- SQLite `better-sqlite3`
- 东方财富公开接口抓取
- `node-cache` 内存缓存

## 当前实现状态

- 前端已收敛为「只推涨停播报」：侧边栏只保留 `/ztlive`，其余功能路由保留但入口隐藏（见 `AppLayout.vue` 的 `hidden` 标记）。
- 涨停播报有两个入口：站点页 `/ztlive`，以及给通达信面板用的独立页 `/ztlive.html`（无侧边栏、独立打包，见 `TDX_STANDALONE.md`）。
- 涨停播报已支持语音开关：右上角「语音开 / 语音关」+ 试听 + 语速 / 音量 / 播报范围设置，只播报打开页面后新出现的涨停与炸板。
- 后端提供 `/api/home`、`/api/ztlive`、`/api/lianban`、`/api/longhu`、`/api/jingjia`、`/api/zijin`、`/api/zixuan`、`/api/fupan`、`/api/kline` 等接口。
- 首页、自选股等页面已优先使用真实接口，接口失败时部分页面仍保留 mock/fallback 兜底。
- 前端提供 `/status` 上线状态中心和 `/about` 数据来源与风险说明页面。
- 数据库存储目前以 SQLite 为主，数据库文件位于 `backend/data/duanxian.db`。

## 项目结构

```text
duanxian/
├─ frontend/              # Vue 3 前端
│  ├─ src/
│  │  ├─ api/             # API 请求层
│  │  ├─ assets/          # 全局样式
│  │  ├─ components/      # 布局与通用组件
│  │  ├─ mock/            # 前端 mock 数据
│  │  ├─ router/          # 路由
│  │  ├─ stores/          # Pinia 状态管理
│  │  ├─ utils/           # 前端工具函数
│  │  └─ views/           # 页面
│  └─ vite.config.js
├─ backend/               # Express 后端
│  ├─ data/               # SQLite 数据文件
│  └─ src/
│     ├─ config/          # 环境配置
│     ├─ db/              # SQLite 初始化与 seed
│     ├─ routes/          # API 路由
│     └─ services/        # 数据抓取、转换、缓存
├─ README.md
└─ LAUNCH.md
```

## 本地启动

后端：

```bash
cd backend
npm install
npm run dev
```

默认地址：`http://localhost:8080/api`

前端：

```bash
cd frontend
npm install
npm run dev
```

默认地址：`http://localhost:3000`

## 构建

```bash
cd frontend
npm run build
```

## 数据库初始化

首次启动后端时，如果 `market_indices` 为空，会自动执行种子数据初始化。

也可以手动执行：

```bash
cd backend
npm run seed
```

## 重要说明

- README 反映的是当前代码实际状态，不再以 MongoDB/Redis 为当前主存储实现。
- 后端使用 `PORT`、`CORS_ORIGIN` 和 `ZTLIVE_SOURCE_URL` 等基础环境变量，配置已经按 SQLite + 行情抓取方案收口。
- 东方财富接口属于外部依赖，可能因网络或接口变化出现波动，前端部分页面因此保留了 fallback。
- 上线后建议先打开 `/status` 做一次接口自检，再观察 PM2、Nginx 和备份脚本是否正常。
- `/ztlive` 使用服务端代理的涨停播报公开行情快照，页面每 3 秒轮询一次；板块筛选和涨停/炸板明细均在页面内完成。
- 后端对上游快照的缓存窗口是 1.5 秒，且过期时**等这次抓取完成再返回**，不做「先回旧数据、后台再刷新」，否则每个轮询都会固定慢一轮。
- 页面 30 秒没拿到新数据会显示「数据已 N 秒未更新」，用来区分「行情没变化」和「链路断了」。
- `/ztlive.html` 是同一个页面的独立外壳，构建后直接放在站点根目录，供通达信面板嵌入使用。
- 涨停播报的语音默认关闭，开关状态存在浏览器本地；未开启时页面完全不受影响。

## 关键文件

- 后端入口：`backend/src/index.js`
- 数据库初始化：`backend/src/db/index.js`
- 种子数据：`backend/src/db/seed.js`
- 东方财富抓取：`backend/src/services/eastMoneyService.js`
- 数据聚合：`backend/src/services/marketDataService.js`
- 前端入口：`frontend/src/main.js`
- 布局组件：`frontend/src/components/layout/AppLayout.vue`
- 首页：`frontend/src/views/Home.vue`
- 涨停播报：`frontend/src/views/Ztlive.vue`
- 涨停播报独立页：`frontend/src/views/ZtliveEmbed.vue`（入口 `frontend/ztlive.html` + `frontend/src/entries/ztlive.js`）
- 涨停播报数据组合式函数：`frontend/src/composables/useZtliveFeed.js`
- 涨停播报语音引擎：`frontend/src/composables/useZtVoice.js`
- 状态中心：`frontend/src/views/Status.vue`
- 自选股：`frontend/src/views/Zixuan.vue`
