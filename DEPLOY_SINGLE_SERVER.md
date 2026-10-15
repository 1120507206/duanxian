# 单机上线部署

这套方案适合当前项目的第一阶段上线：

- 前端静态文件由 `Nginx` 托管
- 后端 `Express` 用 `PM2` 常驻
- 数据库继续使用 `SQLite`
- 通过定时脚本做数据库备份

## 1. 服务器准备

推荐：

- Ubuntu 22.04 LTS
- 2C4G
- 40GB 以上系统盘

需要开放：

- `80`
- `443`
- 可选 `22` 用于 SSH

## 2. 安装运行环境

```bash
sudo apt update
sudo apt install -y nginx sqlite3 curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

可选安装 HTTPS 工具：

```bash
sudo apt install -y certbot python3-certbot-nginx
```

## 3. 目录结构建议

建议部署到：

```text
/var/www/duanxian/
├─ frontend/
│  ├─ src/
│  ├─ package.json
│  └─ dist/
├─ backend/
│  ├─ src/
│  ├─ data/
│  ├─ package.json
│  ├─ .env
│  └─ ecosystem.config.cjs
└─ deploy/
   ├─ nginx/
   └─ scripts/
```

你可以直接把当前仓库上传到 `/var/www/duanxian`。

## 4. 首次部署步骤

### 上传代码

方式任选一种：

- `git clone`
- `scp`
- `rsync`

例如：

```bash
sudo mkdir -p /var/www
sudo chown -R $USER:$USER /var/www
cd /var/www
git clone <your-repo-url> duanxian
cd /var/www/duanxian
```

### 配置后端环境变量

```bash
cd /var/www/duanxian/backend
cp .env.example .env
```

当前最少需要：

```env
PORT=8080
CORS_ORIGIN=*
ZTLIVE_SOURCE_URL=https://ds.duanxianxia.com/vendor/stockdata/ztlive_all.json
```

生产环境建议把 `CORS_ORIGIN` 改成真实域名，例如：

```env
CORS_ORIGIN=https://your-domain.com
```

### 安装依赖并构建

```bash
cd /var/www/duanxian/frontend
npm ci
npm run build

cd /var/www/duanxian/backend
npm ci --omit=dev
```

### 启动后端

```bash
cd /var/www/duanxian/backend
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### 配置 PM2 日志轮转

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

### 配置 Nginx

复制模板：

```bash
sudo cp /var/www/duanxian/deploy/nginx/duanxian.conf /etc/nginx/sites-available/duanxian
sudo ln -sf /etc/nginx/sites-available/duanxian /etc/nginx/sites-enabled/duanxian
```

把配置里的：

- `server_name your-domain.com;`
- `root /var/www/duanxian/frontend/dist;`

改成你的真实域名和部署目录。

然后检查并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5. 配置 HTTPS

域名解析生效后执行：

```bash
sudo certbot --nginx -d your-domain.com
```

如果有 `www` 子域名，也一起加上：

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

## 6. 数据库备份

项目已经提供备份脚本：

- `deploy/scripts/backup-sqlite.sh`

给执行权限：

```bash
chmod +x /var/www/duanxian/deploy/scripts/backup-sqlite.sh
```

手动测试：

```bash
/var/www/duanxian/deploy/scripts/backup-sqlite.sh
```

建议加到 `crontab`，例如每天凌晨 3 点备份：

```bash
crontab -e
```

加入：

```cron
0 3 * * * /var/www/duanxian/deploy/scripts/backup-sqlite.sh >> /var/log/duanxian-backup.log 2>&1
```

### 恢复备份

项目也提供恢复脚本：

- `deploy/scripts/restore-sqlite.sh`

给执行权限：

```bash
chmod +x /var/www/duanxian/deploy/scripts/restore-sqlite.sh
```

执行恢复：

```bash
/var/www/duanxian/deploy/scripts/restore-sqlite.sh /var/backups/duanxian/duanxian-YYYY-MM-DD-HHMMSS.db
```

脚本会先停掉 `duanxian-api`，把当前数据库复制为 `.before-restore-*`，再恢复备份文件并重启服务。

## 7. 发布更新

项目已经提供发布脚本：

- `deploy/scripts/deploy-single-server.sh`

给执行权限：

```bash
chmod +x /var/www/duanxian/deploy/scripts/deploy-single-server.sh
```

执行更新：

```bash
/var/www/duanxian/deploy/scripts/deploy-single-server.sh
```

这会做：

1. 前端安装依赖并重新构建
2. 后端安装生产依赖
3. 确保 `data` 目录存在
4. 用 `PM2` 重启后端

## 8. 上线后检查

建议至少确认：

- `http://127.0.0.1:8080/api/health` 返回 `status: "ok"`
- `/api/health` 中 `database.ok` 为 `true`
- 域名首页能打开
- `/api/home`、`/api/lianban` 正常返回数据
- `/api/ztlive` 正常返回涨停播报数据
- `/status` 页面可以访问，并能完成核心接口自检
- `/ztlive` 页面可以访问，板块筛选和自动刷新正常
- `pm2 status` 显示在线
- `pm2 logs duanxian-api` 能看到后端日志
- `sudo nginx -t` 无错误
- 缓存头分工正确：`curl -I http://域名/` 返回 `Cache-Control: no-cache`；`curl -I` 一个 `/assets/*.js` 返回 `public, max-age=604800, immutable`；访问不存在的资产返回 `404` 且**没有** `Cache-Control`（否则 404 会被缓存 7 天）。
- 备份脚本可执行
- 恢复脚本至少在测试备份上演练一次
- 浏览器首次访问会显示风险提示
- `/about` 页面可以访问，数据来源和风险说明完整展示
- 断开后端或模拟接口失败时，前端会出现错误提示

也可以使用自检脚本：

```bash
chmod +x /var/www/duanxian/deploy/scripts/check-production.sh
BASE_URL=http://127.0.0.1:8080 SITE_URL=https://your-domain.com /var/www/duanxian/deploy/scripts/check-production.sh
```

## 9. 你还需要手动准备的东西

- 域名
- 域名解析
- 云服务器
- HTTPS 证书签发
- 数据源稳定性监控

## 10. 当前方案边界

这是一套“单机可上线版”，适合：

- 个人项目
- 轻量访问
- MVP 验证

如果后续要支撑更多用户，建议下一阶段升级：

- SQLite -> PostgreSQL
- 增加监控和错误告警
- 增加用户登录体系
- 减少对单一外部行情源的依赖
