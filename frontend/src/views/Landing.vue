<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Notification,
  Link as LinkIcon,
  Monitor,
  Microphone,
  TrendCharts,
  Timer,
  Check,
  ArrowRight,
  CopyDocument,
  Promotion,
  Sunny,
  Moon,
} from '@element-plus/icons-vue'
import { useThemeStore } from '@/stores/theme'
import { fetchZtlive, fetchPlans } from '@/api'
import { MEMBER_CONFIG } from '@/config/member'
import { track } from '@/utils/track'
import { buildShareUrl, getChannel } from '@/utils/deviceId'

const router = useRouter()
const themeStore = useThemeStore()
const currentYear = new Date().getFullYear()
const copySuccess = ref(false)
const siteUrl = computed(() => (typeof window !== 'undefined' ? window.location.origin : ''))

/**
 * 功能卡配置。
 * `accent` 为显式 CSS 渐变（不再依赖 Tailwind 工具类，避免 content 扫描
 * 覆盖不到导致的配色丢失），统一收敛为「红/橙品牌主色 + 少量辅助色」。
 */
const features = [
  {
    icon: Notification,
    title: '实时涨停播报',
    // 原为「毫秒级追踪」。实测端到端是 3~4 秒（上游快照约 3 秒一写），
    // 宣传口径必须与实现一致 —— 宁可低报，也不要被用户当场打脸。
    description: '秒级追踪涨停板与炸板，第一时间掌握市场最强音',
    accent: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
  },
  {
    icon: Monitor,
    title: '嵌入通达信',
    description: '一键嵌入通达信、同花顺等主流软件，交易看盘无缝衔接',
    accent: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)',
  },
  {
    icon: Microphone,
    title: '语音播报',
    description: '支持语音实时播报，开车盯盘两不误',
    accent: 'linear-gradient(135deg, #e11d48 0%, #ef4444 100%)',
  },
  {
    icon: LinkIcon,
    title: '复制链接分享',
    description: '一键复制专属链接，分享给好友共同追踪',
    accent: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
  },
  {
    icon: TrendCharts,
    title: '板块筛选',
    description: '按板块快速筛选，精准定位热点方向',
    accent: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
  },
  {
    icon: Timer,
    title: '炸板即时提示',
    // 原为「历史回溯」，但后端目前只代理当日快照、没有历史查询接口。
    // 改成真正已实现的能力，避免为不存在的功能做宣传。
    description: '封板被打开立刻转为炸板状态，不错过情绪转折',
    accent: 'linear-gradient(135deg, #dc2626 0%, #e11d48 100%)',
  },
]

const steps = [
  {
    num: '01',
    title: '访问涨停播报',
    description: '打开短线侠涨停播报页面，实时数据自动更新',
  },
  {
    num: '02',
    title: '复制专属链接',
    description: '点击复制按钮，获取可嵌入的播报链接',
  },
  {
    num: '03',
    title: '嵌入交易软件',
    description: '在通达信中添加自定义页面，粘贴链接即可使用',
  },
]

/**
 * 套餐定义从后端下发（/api/user/plans），前端不硬编码价格 ——
 * 之前定价写死在这里，结果出现「年付 299 却标节省 25%」而实际 12×19.9=238.8 的矛盾。
 * 单一事实来源放在后端 config/plans.js，这类错误就不会再发生。
 */
const plans = ref([])
const plansLoading = ref(true)

const monthPlan = computed(() => plans.value.find((plan) => plan.key === 'month') || null)

/** 折合月单价，用于给出可比的锚点 */
function monthlyEquivalent(plan) {
  if (!plan?.durationDays) return 0
  return Math.round((plan.price / plan.durationDays) * 30)
}

/** 相对「按月买」省下的比例。没有月付基准时返回 0，不编造数字。 */
function savingPercent(plan) {
  const base = monthPlan.value
  if (!base?.durationDays || !plan?.durationDays) return 0
  const monthlyTotal = (base.price / base.durationDays) * plan.durationDays
  if (!monthlyTotal) return 0
  const saved = Math.round((1 - plan.price / monthlyTotal) * 100)
  return saved > 0 ? saved : 0
}

function isRecommended(plan) {
  return plan?.key === 'year'
}

/**
 * 实时行情统计。
 *
 * 这里原本是硬编码的「10000+ 活跃用户 / 5000+ 日均追踪 / 99% 数据准确率」——
 * 三个都无法举证，既触《广告法》虚假宣传，又会在用户发现后一次性赔掉全部信任。
 * 换成今天真实的涨停数据：既 100% 属实，又顺手证明了「数据是活的」，
 * 比任何营销数字都有说服力。
 */
const liveStats = ref(null)
const liveStatsFailed = ref(false)

const statItems = computed(() => {
  const s = liveStats.value
  if (!s) return []
  return [
    { value: String(s.sealed ?? 0), unit: '家', label: '今日涨停' },
    { value: String(s.blown ?? 0), unit: '家', label: '今日炸板' },
    { value: `${s.sealRate ?? 0}`, unit: '%', label: '封板率' },
    { value: s.maxBoard ? String(s.maxBoard) : '--', unit: '板', label: '最高连板' },
  ]
})

async function loadLiveStats() {
  try {
    const data = await fetchZtlive()
    if (data?.summary) {
      liveStats.value = data.summary
      tracked.value = data.summary.total > 0
    } else {
      liveStatsFailed.value = true
    }
  } catch (_) {
    // 非交易时段或上游波动都算正常，静默降级即可，不在营销页弹错误提示
    liveStatsFailed.value = true
  }
}

async function loadPlans() {
  try {
    const data = await fetchPlans()
    plans.value = Array.isArray(data?.plans) ? data.plans : []
  } catch (_) {
    plans.value = []
  } finally {
    plansLoading.value = false
  }
}

const tracked = ref(false)

/**
 * 复制「涨停播报 · 独立页」链接（/ztlive.html）。
 * 独立页无侧边栏、独立打包，是给通达信等面板嵌入用的地址。
 * 带成功 / 失败两种反馈，失败时降级为手动选中的 textarea 复制。
 */
async function copyLink() {
  // 复制出去的链接带上来源码：别人通过它打开时会被归因到同一条链路上。
  // 没有现成渠道时退化成 share，至少能把「分享带来的用户」和自然流量分开统计。
  const link = buildShareUrl(`${siteUrl.value}/ztlive.html`, getChannel() || 'share')

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link)
    } else {
      // 非安全上下文（http）或无 Clipboard API 时的兜底方案
      const textarea = document.createElement('textarea')
      textarea.value = link
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }

    copySuccess.value = true
    track('copy_link', { scene: 'landing' })
    ElMessage({
      type: 'success',
      message: '独立页链接已复制，可直接粘贴到通达信自定义页面',
      duration: 2600,
      showClose: true,
    })
    setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  } catch (error) {
    console.warn('[landing] 复制独立页链接失败:', error)
    ElMessage({
      type: 'error',
      message: '复制失败，请手动复制：' + link,
      duration: 4000,
      showClose: true,
    })
  }
}

function goToZtlive() {
  track('page_view', { scene: 'landing_cta' })
  router.push('/ztlive')
}

function goToActivate() {
  track('pay_click', { scene: 'landing_pricing' })
  router.push('/activate')
}

function toggleTheme() {
  themeStore.toggle()
}

onMounted(() => {
  track('page_view', { scene: 'landing' })
  loadLiveStats()
  loadPlans()
})
</script>

<template>
  <div class="landing-page">
    <!-- 主题切换：Landing 不挂 AppLayout，这里提供独立入口 -->
    <button
      class="theme-fab"
      type="button"
      :title="themeStore.isDark ? '切换到浅色' : '切换到深色'"
      :aria-label="themeStore.isDark ? '切换到浅色' : '切换到深色'"
      @click="toggleTheme"
    >
      <el-icon :size="18" class="theme-fab-icon">
        <Sunny v-if="themeStore.isDark" />
        <Moon v-else />
      </el-icon>
      <span class="theme-fab-label">{{ themeStore.isDark ? '浅色' : '深色' }}</span>
    </button>

    <!-- Hero Section -->
    <section class="hero">
      <div class="hero-bg">
        <div class="hero-gradient"></div>
        <div class="hero-grid"></div>
      </div>

      <div class="hero-content">
        <div class="hero-badge">
          <Promotion class="badge-icon" />
          <span>免费版直接可用，无需注册</span>
        </div>

        <h1 class="hero-title">
          <span class="title-line">A股涨停</span>
          <span class="title-gradient">实时播报</span>
        </h1>

        <p class="hero-subtitle">
          毫秒级追踪涨停板与炸板，支持嵌入通达信等主流交易软件<br />
          让短线交易快人一步
        </p>

        <div class="hero-actions">
          <button class="btn-primary" @click="goToZtlive">
            <span>立即体验</span>
            <ArrowRight class="btn-icon" />
          </button>
          <button class="btn-secondary" @click="copyLink">
            <CopyDocument class="btn-icon" />
            <span>{{ copySuccess ? '已复制' : '复制链接' }}</span>
          </button>
        </div>

        <!-- 真实行情数据：既属实，又顺手证明了「数据是活的」 -->
        <div class="hero-stats">
          <template v-if="statItems.length">
            <div v-for="item in statItems" :key="item.label" class="stat-item">
              <div class="stat-value">
                {{ item.value }}<i class="stat-unit">{{ item.unit }}</i>
              </div>
              <div class="stat-label">{{ item.label }}</div>
            </div>
          </template>
          <div v-else class="stat-empty">
            {{ liveStatsFailed ? '非交易时段，开盘后数据自动更新' : '正在读取今日行情…' }}
          </div>
        </div>
      </div>

      <div class="hero-visual">
        <div class="visual-card">
          <div class="visual-card-header">
            <div class="card-dots">
              <span class="dot dot-red"></span>
              <span class="dot dot-yellow"></span>
              <span class="dot dot-green"></span>
            </div>
            <div class="visual-card-title">涨停播报</div>
            <span class="live-pill">
              <span class="live-dot"></span>实时
            </span>
          </div>
          <div class="visual-card-cols">
            <span>名称 / 代码</span>
            <span>现价 / 涨跌幅</span>
          </div>
          <div class="visual-card-body">
            <div class="stock-item">
              <div class="stock-info">
                <span class="stock-name">东方财富</span>
                <span class="stock-code">300059</span>
              </div>
              <div class="stock-price">
                <span class="price-value">28.56</span>
                <span class="price-change">+10.00%</span>
              </div>
            </div>
            <div class="stock-item">
              <div class="stock-info">
                <span class="stock-name">宁德时代</span>
                <span class="stock-code">300750</span>
              </div>
              <div class="stock-price">
                <span class="price-value">215.80</span>
                <span class="price-change">+10.00%</span>
              </div>
            </div>
            <div class="stock-item">
              <div class="stock-info">
                <span class="stock-name">比亚迪</span>
                <span class="stock-code">002594</span>
              </div>
              <div class="stock-price">
                <span class="price-value">268.45</span>
                <span class="price-change">+9.98%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section class="features">
      <div class="section-container">
        <div class="section-header">
          <h2 class="section-title">核心功能</h2>
          <p class="section-subtitle">为短线交易者打造的专业工具</p>
        </div>

        <div class="features-grid">
          <div v-for="(feature, index) in features" :key="index" class="feature-card">
            <div class="feature-icon" :style="{ background: feature.accent }">
              <component :is="feature.icon" class="icon-svg" />
            </div>
            <h3 class="feature-title">{{ feature.title }}</h3>
            <p class="feature-description">{{ feature.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- How to Use Section -->
    <section class="how-to-use">
      <div class="section-container">
        <div class="section-header">
          <h2 class="section-title">三步开始使用</h2>
          <p class="section-subtitle">简单快速，即刻嵌入你的交易软件</p>
        </div>

        <div class="steps-container">
          <div v-for="(step, index) in steps" :key="index" class="step-card">
            <div class="step-num">{{ step.num }}</div>
            <h3 class="step-title">{{ step.title }}</h3>
            <p class="step-description">{{ step.description }}</p>
            <div v-if="index < steps.length - 1" class="step-arrow">
              <ArrowRight />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Pricing Section -->
    <section class="pricing">
      <div class="section-container">
        <div class="section-header">
          <div class="promo-badge">
            <Promotion class="promo-icon" />
            <span>免费版无需注册</span>
          </div>
          <h2 class="section-title">看表免费，语音收费</h2>
          <p class="section-subtitle">
            涨停明细、板块统计、涨停原因全部免费；会员解锁语音播报，让新涨停自己出声
          </p>
        </div>

        <div v-if="plansLoading" class="pricing-loading">正在读取套餐…</div>

        <div v-else-if="!plans.length" class="pricing-loading">
          套餐信息暂时不可用，可直接前往
          <a href="#" @click.prevent="goToActivate">开通页</a> 查看
        </div>

        <div v-else class="pricing-grid">
          <div
            v-for="plan in plans"
            :key="plan.key"
            class="pricing-card"
            :class="{ highlighted: isRecommended(plan) }"
          >
            <div v-if="isRecommended(plan)" class="pricing-badge">推荐</div>
            <h3 class="pricing-name">{{ plan.name }}</h3>
            <div class="pricing-price">
              <span class="price-currency">¥</span>
              <span class="price-amount">{{ plan.price }}</span>
              <span class="price-period">/{{ plan.durationDays }}天</span>
            </div>
            <p class="pricing-description">
              折合 ¥{{ monthlyEquivalent(plan) }}/月
              <span v-if="savingPercent(plan) > 0" class="price-saving">
                比按月买省 {{ savingPercent(plan) }}%
              </span>
            </p>
            <ul class="pricing-features">
              <li v-for="(feature, index) in MEMBER_CONFIG.memberFeatures" :key="index">
                <span class="feature-check">
                  <Check class="feature-check-svg" />
                </span>
                <span>{{ feature }}</span>
              </li>
            </ul>
            <button
              class="pricing-btn"
              :class="{ 'btn-highlighted': isRecommended(plan) }"
              @click="goToActivate"
            >
              去开通
            </button>
          </div>
        </div>

        <!-- 免费版说明：把「不要钱也能用」说透，转化率反而更高 -->
        <div class="pricing-free-note">
          <div class="free-note-head">
            <span class="free-note-tag">免费版</span>
            <span class="free-note-desc">不付费也能一直用，包含：</span>
          </div>
          <ul class="free-note-list">
            <li v-for="(item, index) in MEMBER_CONFIG.freeFeatures" :key="index">
              <span class="feature-check feature-check-muted">
                <Check class="feature-check-svg feature-check-svg-muted" />
              </span>
              <span>{{ item }}</span>
            </li>
          </ul>
          <button class="free-note-btn" @click="goToZtlive">直接开始使用</button>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <div class="footer-container">
        <div class="footer-content">
          <div class="footer-brand">
            <div class="footer-logo">
              <div class="logo-icon">
                <span class="logo-letters">DX</span>
              </div>
              <div class="logo-text-group">
                <span class="logo-text">短线侠</span>
                <span class="logo-sub">DuanXianXia</span>
              </div>
            </div>
            <p class="footer-description">
              A股短线交易者的专业工具，让交易更简单
            </p>
          </div>

          <div class="footer-links">
            <div class="link-group">
              <h4 class="link-title">产品</h4>
              <a href="/ztlive" class="link-item">涨停播报</a>
              <a href="/ztlive.html" class="link-item">独立页面</a>
            </div>
            <div class="link-group">
              <h4 class="link-title">会员</h4>
              <a href="/activate" class="link-item">开通会员</a>
              <a href="/activate" class="link-item">激活码兑换</a>
            </div>
            <div class="link-group">
              <h4 class="link-title">支持</h4>
              <a href="/about" class="link-item">风险说明</a>
            </div>
          </div>
        </div>

        <div class="footer-bottom">
          <p class="footer-copyright">
            © {{ currentYear }} 短线侠 DuanXianXia. All rights reserved.
          </p>
          <p class="footer-disclaimer">
            本工具仅供研究参考，不构成投资建议。市场有风险，投资需谨慎。
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ============================================================
   落地页 —— 全量走主题令牌，明暗自适应
   仅保留两类裸 hex：① 涨跌/品牌语义色（红橙）② 彩底白字 #fff
   ============================================================ */
.landing-page {
  position: relative;
  background: var(--color-bg-base);
  color: var(--color-text-primary);
  overflow-x: hidden;
  transition: background-color var(--transition-smooth), color var(--transition-smooth);
}

/* ---------- 主题切换浮层 ---------- */
.theme-fab {
  position: fixed;
  top: 20px;
  right: 24px;
  z-index: 50;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-card);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(8px);
  transition: all var(--transition-fast);
}

.theme-fab:hover {
  color: var(--color-rise);
  border-color: var(--color-rise);
  background: var(--color-rise-soft);
  transform: translateY(-1px);
  box-shadow: var(--shadow-card-hover);
}

.theme-fab-icon { transition: transform var(--transition-smooth); }
.theme-fab:hover .theme-fab-icon { transform: rotate(20deg); }
.theme-fab-label { line-height: 1; }

/* ---------- Hero ---------- */
.hero {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 120px 8% 80px;
  gap: 60px;
}

.hero-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  z-index: 0;
}

.hero-gradient {
  position: absolute;
  top: -50%;
  right: -20%;
  width: 80%;
  height: 150%;
  background: radial-gradient(ellipse, rgba(239, 68, 68, 0.15) 0%, transparent 70%);
  animation: float 20s ease-in-out infinite;
}

html:not(.dark) .hero-gradient {
  background: radial-gradient(ellipse, rgba(239, 68, 68, 0.10) 0%, transparent 70%);
}

.hero-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: 50px 50px;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
}

html:not(.dark) .hero-grid {
  background-image:
    linear-gradient(rgba(15, 23, 42, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15, 23, 42, 0.04) 1px, transparent 1px);
}

@keyframes float {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  50% { transform: translate(-30px, 30px) rotate(5deg); }
}

.hero-content {
  position: relative;
  z-index: 1;
  flex: 1;
  max-width: 600px;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(249, 115, 22, 0.15));
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 100px;
  font-size: 14px;
  font-weight: 500;
  color: #dc2626;
  margin-bottom: 24px;
  animation: fadeInUp 0.6s ease-out;
}

html.dark .hero-badge {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(249, 115, 22, 0.15));
  border-color: rgba(239, 68, 68, 0.3);
  color: #f87171;
}

.badge-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.hero-title {
  font-size: 76px;
  font-weight: 900;
  line-height: 1.08;
  letter-spacing: -0.02em;
  margin-bottom: 24px;
  animation: fadeInUp 0.6s ease-out 0.1s both;
}

.title-line {
  display: block;
  color: var(--color-text-primary);
}

.title-gradient {
  display: block;
  background: linear-gradient(120deg, #ef4444 0%, #f97316 55%, #f59e0b 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: 18px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  margin-bottom: 40px;
  animation: fadeInUp 0.6s ease-out 0.2s both;
}

.hero-actions {
  display: flex;
  gap: 16px;
  margin-bottom: 60px;
  animation: fadeInUp 0.6s ease-out 0.3s both;
}

.btn-primary,
.btn-secondary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 32px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: none;
}

.btn-primary {
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  color: #fff;
  box-shadow: 0 8px 24px rgba(239, 68, 68, 0.3);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 34px rgba(239, 68, 68, 0.42);
}

.btn-secondary {
  background: var(--color-bg-card);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-light);
}

.btn-secondary:hover {
  background: var(--color-bg-card-hover);
  border-color: var(--color-rise);
  color: var(--color-rise);
  transform: translateY(-2px);
}

.btn-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.hero-stats {
  display: flex;
  align-items: center;
  gap: 32px;
  animation: fadeInUp 0.6s ease-out 0.4s both;
}

.stat-item {
  text-align: left;
}

.stat-value {
  font-size: 38px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 4px;
  line-height: 1.1;
}

.stat-label {
  font-size: 14px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.stat-unit {
  margin-left: 2px;
  font-size: 18px;
  font-style: normal;
  font-weight: 700;
}

.stat-empty {
  font-size: 14px;
  color: var(--color-text-muted);
}

/* ---------- Hero 右侧模拟卡片 ---------- */
.hero-visual {
  position: relative;
  z-index: 1;
  flex: 1;
  max-width: 500px;
  animation: fadeInRight 0.8s ease-out 0.3s both;
}

.visual-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--shadow-card-hover);
  transition: transform var(--transition-smooth), box-shadow var(--transition-smooth);
}

.visual-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-card-hover);
}

.visual-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  background: var(--color-bg-deep);
  border-bottom: 1px solid var(--color-border);
}

.card-dots {
  display: flex;
  gap: 6px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.dot-red { background: #ef4444; }
.dot-yellow { background: #f59e0b; }
.dot-green { background: #22c55e; }

.visual-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  letter-spacing: 0.02em;
}

.live-pill {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: #dc2626;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--color-rise-soft);
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef4444;
  animation: pulse-live 1.6s ease-in-out infinite;
}

@keyframes pulse-live {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.8); }
}

.visual-card-cols {
  display: flex;
  justify-content: space-between;
  padding: 10px 22px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border);
}

.visual-card-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stock-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  background: transparent;
  border-radius: 10px;
  transition: background-color var(--transition-fast), transform var(--transition-fast);
}

.stock-item:hover {
  background: var(--color-bg-card-hover);
  transform: translateX(4px);
}

.stock-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.stock-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.stock-code {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
}

.stock-price {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}

.price-value {
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary);
}

.price-change {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-rise);
}

/* ---------- 区块通用 ---------- */
.section-container {
  max-width: 1200px;
  margin: 0 auto;
}

.section-header {
  text-align: center;
  margin-bottom: 72px;
}

.section-title {
  font-size: 46px;
  font-weight: 800;
  letter-spacing: -0.01em;
  margin-bottom: 16px;
  color: var(--color-text-primary);
}

.section-subtitle {
  font-size: 18px;
  color: var(--color-text-secondary);
}

/* ---------- Features ---------- */
.features {
  padding: 120px 8%;
  background: var(--color-bg-deep);
  transition: background-color var(--transition-smooth);
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 28px;
}

.feature-card {
  padding: 32px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  transition: all var(--transition-smooth);
}

.feature-card:hover {
  border-color: var(--color-border-light);
  transform: translateY(-8px);
  box-shadow: var(--shadow-card-hover);
}

.feature-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  margin-bottom: 20px;
  box-shadow: 0 8px 20px rgba(239, 68, 68, 0.22);
}

.icon-svg {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.feature-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 12px;
  color: var(--color-text-primary);
}

.feature-description {
  font-size: 15px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

/* ---------- How to Use ---------- */
.how-to-use {
  padding: 120px 8%;
  background: var(--color-bg-base);
  transition: background-color var(--transition-smooth);
}

.steps-container {
  display: flex;
  gap: 24px;
  justify-content: center;
}

.step-card {
  flex: 1;
  max-width: 320px;
  padding: 32px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  position: relative;
  transition: all var(--transition-smooth);
}

.step-card:hover {
  border-color: var(--color-border-light);
  transform: translateY(-4px);
  box-shadow: var(--shadow-card-hover);
}

.step-num {
  font-size: 48px;
  font-weight: 900;
  line-height: 1;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 16px;
}

.step-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 12px;
  color: var(--color-text-primary);
}

.step-description {
  font-size: 15px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.step-arrow {
  position: absolute;
  right: -32px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  color: var(--color-text-muted);
}

/* ---------- Pricing ---------- */
.pricing {
  padding: 120px 8%;
  background: var(--color-bg-deep);
  transition: background-color var(--transition-smooth);
}

.promo-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--color-fall-soft);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 100px;
  font-size: 15px;
  font-weight: 600;
  color: #16a34a;
  margin-bottom: 24px;
}

html.dark .promo-badge {
  color: #22c55e;
}

.promo-icon {
  width: 18px;
  height: 18px;
}

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 32px;
  max-width: 880px;
  margin: 0 auto;
}

.pricing-card {
  padding: 40px 32px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  position: relative;
  transition: all var(--transition-smooth);
}

.pricing-card:hover {
  border-color: var(--color-border-light);
  transform: translateY(-8px);
  box-shadow: var(--shadow-card-hover);
}

.pricing-card.highlighted {
  border: 2px solid transparent;
  background:
    linear-gradient(var(--color-bg-card), var(--color-bg-card)) padding-box,
    linear-gradient(135deg, #ef4444, #f97316) border-box;
  box-shadow: 0 20px 50px rgba(239, 68, 68, 0.18);
}

.pricing-badge {
  position: absolute;
  top: -12px;
  right: 24px;
  padding: 6px 16px;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  border-radius: 100px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
}

.pricing-name {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 16px;
  color: var(--color-text-primary);
}

.pricing-price {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 12px;
}

.price-currency {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.price-amount {
  font-size: 56px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
}

.price-period {
  font-size: 18px;
  color: var(--color-text-muted);
  font-weight: 500;
}

.pricing-description {
  font-size: 15px;
  color: var(--color-text-secondary);
  margin-bottom: 32px;
}

.price-saving {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-fall-soft);
  color: #16a34a;
  font-size: 12px;
  font-weight: 600;
}

html.dark .price-saving {
  color: #22c55e;
}

.pricing-loading {
  padding: 40px 0;
  text-align: center;
  font-size: 14px;
  color: var(--color-text-muted);
}

.pricing-loading a {
  color: var(--color-rise);
}

/* ---------- 免费版说明 ---------- */
.pricing-free-note {
  max-width: 720px;
  margin: 48px auto 0;
  padding: 24px 28px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-bg-card);
}

.free-note-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.free-note-tag {
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.free-note-desc {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.free-note-list {
  list-style: none;
  margin: 0 0 20px;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.free-note-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  color: var(--color-text-secondary);
}

.feature-check-muted {
  background: var(--color-border);
}

.feature-check-svg-muted {
  color: var(--color-text-muted);
}

.free-note-btn {
  padding: 11px 24px;
  border-radius: 10px;
  border: 1px solid var(--color-border-light);
  background: var(--color-bg-base);
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-smooth);
}

.free-note-btn:hover {
  border-color: var(--color-rise);
  color: var(--color-rise);
  background: var(--color-rise-soft);
}

.pricing-features {
  list-style: none;
  margin: 0 0 32px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pricing-features li {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  color: var(--color-text-primary);
}

.feature-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--color-fall-soft);
}

.feature-check-svg {
  width: 14px;
  height: 14px;
  color: #16a34a;
}

html.dark .feature-check-svg {
  color: #22c55e;
}

.pricing-btn {
  width: 100%;
  padding: 16px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-smooth);
  background: var(--color-bg-base);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-light);
}

.pricing-btn:hover {
  border-color: var(--color-rise);
  color: var(--color-rise);
  background: var(--color-rise-soft);
}

.pricing-btn.btn-highlighted {
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  color: #fff;
  border: none;
  box-shadow: 0 8px 24px rgba(239, 68, 68, 0.3);
}

.pricing-btn.btn-highlighted:hover {
  color: #fff;
  box-shadow: 0 14px 32px rgba(239, 68, 68, 0.42);
  transform: translateY(-2px);
}

/* ---------- Footer ---------- */
.footer {
  padding: 64px 8% 40px;
  background: var(--color-bg-base);
  border-top: 1px solid var(--color-border);
  transition: background-color var(--transition-smooth);
}

.footer-container {
  max-width: 1200px;
  margin: 0 auto;
}

.footer-content {
  display: flex;
  justify-content: space-between;
  gap: 60px;
  margin-bottom: 40px;
}

.footer-brand {
  flex: 1;
}

.footer-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.footer-logo .logo-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

.footer-logo .logo-letters {
  color: #fff;
  font-weight: 900;
  font-size: 16px;
}

.footer-logo .logo-text-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.footer-logo .logo-text {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.footer-logo .logo-sub {
  font-size: 11px;
  color: var(--color-text-muted);
}

.footer-description {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.footer-links {
  display: flex;
  gap: 80px;
}

.link-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.link-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 8px;
}

.link-item {
  font-size: 14px;
  color: var(--color-text-secondary);
  text-decoration: none;
  transition: color var(--transition-fast), transform var(--transition-fast);
}

.link-item:hover {
  color: var(--color-rise);
}

.footer-bottom {
  padding-top: 32px;
  border-top: 1px solid var(--color-border);
  text-align: center;
}

.footer-copyright {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 12px;
}

.footer-disclaimer {
  font-size: 13px;
  color: var(--color-text-muted);
  line-height: 1.6;
}

/* ---------- Animations ---------- */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeInRight {
  from {
    opacity: 0;
    transform: translateX(50px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* ---------- Responsive ---------- */
@media (max-width: 1024px) {
  .hero {
    flex-direction: column;
    text-align: center;
    padding: 110px 5% 60px;
  }

  .hero-content {
    max-width: 100%;
  }

  .hero-title {
    font-size: 56px;
  }

  .hero-subtitle br {
    display: none;
  }

  .hero-visual {
    max-width: 100%;
    width: 100%;
  }

  .hero-stats {
    justify-content: center;
  }

  .steps-container {
    flex-direction: column;
    align-items: center;
  }

  .step-card {
    max-width: 480px;
    width: 100%;
  }

  .step-arrow {
    display: none;
  }
}

@media (max-width: 768px) {
  .theme-fab {
    top: 14px;
    right: 14px;
    padding: 8px 10px;
  }

  .theme-fab-label {
    display: none;
  }

  .hero-title {
    font-size: 42px;
  }

  .hero-subtitle {
    font-size: 16px;
  }

  .hero-actions {
    flex-direction: column;
  }

  .btn-primary,
  .btn-secondary {
    width: 100%;
    justify-content: center;
  }

  .hero-stats {
    flex-wrap: wrap;
    gap: 24px;
  }

  .stat-value {
    font-size: 30px;
  }

  .section-title {
    font-size: 34px;
  }

  .section-header {
    margin-bottom: 48px;
  }

  .features,
  .how-to-use,
  .pricing {
    padding: 80px 6%;
  }

  .features-grid {
    grid-template-columns: 1fr;
  }

  .pricing-grid {
    grid-template-columns: 1fr;
  }

  .footer-content {
    flex-direction: column;
    gap: 40px;
  }

  .footer-links {
    gap: 40px;
  }
}
</style>
