<template>
  <div class="page about-page">
    <div class="page-header">
      <h2 class="page-title">数据与风险说明</h2>
    </div>

    <section class="notice-panel">
      <div class="notice-kicker">重要提示</div>
      <h3>本工具只做研究辅助，不构成投资建议</h3>
      <p>
        短线侠展示的行情、连板、龙虎榜、竞价、资金流向和复盘信息，仅用于个人研究和盘面观察。
        任何页面、指标、榜单或提示都不应被理解为买入、卖出、持有或其他投资建议。
      </p>
    </section>

    <div class="about-grid">
      <section class="about-block">
        <h3>数据来源</h3>
        <p>
          当前数据主要来自第三方公开行情接口，并结合本地 SQLite 缓存和种子数据兜底。
          第三方接口可能存在延迟、缺失、字段变化、访问失败或统计口径差异。
        </p>
      </section>

      <section class="about-block">
        <h3>使用边界</h3>
        <p>
          页面展示结果应以交易所、上市公司公告、券商终端和其他官方渠道为准。
          使用者需要自行判断数据准确性和交易风险。
        </p>
      </section>

      <section class="about-block">
        <h3>风险提示</h3>
        <p>
          证券市场价格波动剧烈，短线交易风险较高。历史走势、资金流向和情绪指标不代表未来表现。
        </p>
      </section>

      <section class="about-block">
        <h3>服务状态</h3>
        <p>
          后端健康检查接口为 <code>/api/health</code>。线上使用时建议打开
          <router-link to="/status" class="inline-link">状态中心</router-link>
          ，配合 PM2、Nginx 日志和数据库备份一起观察。
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.about-page {
  max-width: 1120px;
}

.notice-panel {
  padding: 22px;
  margin-bottom: 16px;
  border: 1px solid rgba(249, 115, 22, 0.36);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(249, 115, 22, 0.11), rgba(239, 68, 68, 0.05)),
    var(--color-bg-card);
}

.notice-kicker {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #f97316;
}

.notice-panel h3,
.about-block h3 {
  margin: 0 0 10px;
  color: var(--color-text-primary);
  font-size: 16px;
  font-weight: 700;
}

.notice-panel p,
.about-block p {
  margin: 0;
  color: var(--color-text-secondary);
  line-height: 1.8;
  font-size: 14px;
}

.about-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.about-block {
  flex: 1 1 360px;
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-card);
}

code {
  color: #f97316;
  font-size: 13px;
}

.inline-link {
  color: #f97316;
  font-weight: 700;
  text-decoration: none;
}

.inline-link:hover {
  color: #fb923c;
}

@media (max-width: 768px) {
  .about-block { flex-basis: 100%; }
}
</style>
