<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
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
} from '@element-plus/icons-vue'

const router = useRouter()
const currentYear = new Date().getFullYear()
const copySuccess = ref(false)
const siteUrl = computed(() => typeof window !== 'undefined' ? window.location.origin : '')

const features = [
  {
    icon: Notification,
    title: '实时涨停播报',
    description: '毫秒级追踪涨停板与炸板，第一时间掌握市场最强音',
    color: 'from-red-500 to-orange-500',
  },
  {
    icon: Monitor,
    title: '嵌入通达信',
    description: '一键嵌入通达信、同花顺等主流软件，交易看盘无缝衔接',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Microphone,
    title: '语音播报',
    description: '支持语音实时播报，开车盯盘两不误',
    color: 'from-purple-500 to-pink-500',
  },
  {
    icon: LinkIcon,
    title: '复制链接分享',
    description: '一键复制专属链接，分享给好友共同追踪',
    color: 'from-green-500 to-emerald-500',
  },
  {
    icon: TrendCharts,
    title: '板块筛选',
    description: '按板块快速筛选，精准定位热点方向',
    color: 'from-yellow-500 to-orange-500',
  },
  {
    icon: Timer,
    title: '历史回溯',
    description: '完整记录当日涨停数据，随时复盘分析',
    color: 'from-indigo-500 to-purple-500',
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

const pricingPlans = [
  {
    name: '月度会员',
    price: '19.9',
    period: '月',
    description: '灵活选择，按需订阅',
    features: [
      '实时涨停播报',
      '语音播报功能',
      '板块筛选',
      '嵌入通达信',
      '复制链接分享',
      '历史数据回溯',
    ],
    highlighted: false,
  },
  {
    name: '年度会员',
    price: '299',
    period: '年',
    originalPrice: '238.8',
    description: '超值推荐，节省 25%',
    features: [
      '实时涨停播报',
      '语音播报功能',
      '板块筛选',
      '嵌入通达信',
      '复制链接分享',
      '历史数据回溯',
      '优先技术支持',
      '新功能抢先体验',
    ],
    highlighted: true,
  },
]

function copyLink() {
  const link = `${siteUrl.value}/ztlive.html`
  navigator.clipboard.writeText(link).then(() => {
    copySuccess.value = true
    setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  })
}

function goToZtlive() {
  router.push('/ztlive')
}

// Animated counter
const counters = ref({
  users: 0,
  stocks: 0,
  accuracy: 0,
})

onMounted(() => {
  const duration = 2000
  const steps = 60
  const interval = duration / steps

  const targets = {
    users: 10000,
    stocks: 5000,
    accuracy: 99,
  }

  let current = 0
  const timer = setInterval(() => {
    current++
    const progress = current / steps

    counters.value.users = Math.floor(targets.users * progress)
    counters.value.stocks = Math.floor(targets.stocks * progress)
    counters.value.accuracy = Math.floor(targets.accuracy * progress)

    if (current >= steps) {
      clearInterval(timer)
      counters.value = targets
    }
  }, interval)

  onBeforeUnmount(() => {
    clearInterval(timer)
  })
})
</script>

<template>
  <div class="landing-page">
    <!-- Hero Section -->
    <section class="hero">
      <div class="hero-bg">
        <div class="hero-gradient"></div>
        <div class="hero-grid"></div>
      </div>

      <div class="hero-content">
        <div class="hero-badge">
          <Promotion class="badge-icon" />
          <span>推广期免费体验</span>
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

        <div class="hero-stats">
          <div class="stat-item">
            <div class="stat-value">{{ counters.users.toLocaleString() }}+</div>
            <div class="stat-label">活跃用户</div>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <div class="stat-value">{{ counters.stocks.toLocaleString() }}+</div>
            <div class="stat-label">日均追踪</div>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <div class="stat-value">{{ counters.accuracy }}%</div>
            <div class="stat-label">数据准确率</div>
          </div>
        </div>
      </div>

      <div class="hero-visual">
        <div class="visual-card">
          <div class="card-header">
            <div class="card-dots">
              <span class="dot dot-red"></span>
              <span class="dot dot-yellow"></span>
              <span class="dot dot-green"></span>
            </div>
            <div class="card-title">涨停播报</div>
          </div>
          <div class="card-body">
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
          <div
            v-for="(feature, index) in features"
            :key="index"
            class="feature-card"
          >
            <div class="feature-icon-wrapper">
              <div class="feature-icon" :class="feature.color">
                <component :is="feature.icon" class="icon-svg" />
              </div>
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
            <span class="promo-icon">🎉</span>
            <span>推广期限时免费</span>
          </div>
          <h2 class="section-title">选择适合你的方案</h2>
          <p class="section-subtitle">推广期间所有功能免费使用</p>
        </div>

        <div class="pricing-grid">
          <div
            v-for="(plan, index) in pricingPlans"
            :key="index"
            class="pricing-card"
            :class="{ highlighted: plan.highlighted }"
          >
            <div v-if="plan.highlighted" class="pricing-badge">推荐</div>
            <h3 class="pricing-name">{{ plan.name }}</h3>
            <div class="pricing-price">
              <span class="price-currency">¥</span>
              <span class="price-amount">{{ plan.price }}</span>
              <span class="price-period">/{{ plan.period }}</span>
            </div>
            <p class="pricing-description">{{ plan.description }}</p>
            <ul class="pricing-features">
              <li v-for="(feature, fIndex) in plan.features" :key="fIndex">
                <Check class="feature-check" />
                <span>{{ feature }}</span>
              </li>
            </ul>
            <button
              class="pricing-btn"
              :class="{ 'btn-highlighted': plan.highlighted }"
              @click="goToZtlive"
            >
              立即体验
            </button>
          </div>
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
              <h4 class="link-title">支持</h4>
              <a href="/status" class="link-item">状态中心</a>
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
.landing-page {
  background: #0a0e17;
  color: #e8edf5;
  overflow-x: hidden;
}

/* Hero Section */
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

.hero-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: 50px 50px;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
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
  color: #f87171;
  margin-bottom: 24px;
  animation: fadeInUp 0.6s ease-out;
}

.badge-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.hero-title {
  font-size: 72px;
  font-weight: 900;
  line-height: 1.1;
  margin-bottom: 24px;
  animation: fadeInUp 0.6s ease-out 0.1s both;
}

.title-line {
  display: block;
  color: #e8edf5;
}

.title-gradient {
  display: block;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: 18px;
  line-height: 1.7;
  color: #8fa0b8;
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
  box-shadow: 0 12px 32px rgba(239, 68, 68, 0.4);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.05);
  color: #e8edf5;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
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
  font-size: 36px;
  font-weight: 800;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 14px;
  color: #64748b;
  font-weight: 500;
}

.stat-divider {
  width: 1px;
  height: 40px;
  background: rgba(255, 255, 255, 0.1);
}

.hero-visual {
  position: relative;
  z-index: 1;
  flex: 1;
  max-width: 500px;
  animation: fadeInRight 0.8s ease-out 0.3s both;
}

.visual-card {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.8), rgba(12, 18, 34, 0.8));
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  overflow: hidden;
  backdrop-filter: blur(20px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #8fa0b8;
}

.card-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stock-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
  transition: all 0.2s;
}

.stock-item:hover {
  background: rgba(255, 255, 255, 0.05);
  transform: translateX(4px);
}

.stock-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stock-name {
  font-size: 15px;
  font-weight: 600;
  color: #e8edf5;
}

.stock-code {
  font-size: 12px;
  color: #64748b;
}

.stock-price {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.price-value {
  font-size: 16px;
  font-weight: 700;
  color: #e8edf5;
}

.price-change {
  font-size: 13px;
  font-weight: 600;
  color: #ef4444;
}

/* Features Section */
.features {
  padding: 120px 8%;
  background: linear-gradient(180deg, #0a0e17 0%, #0f172a 100%);
}

.section-container {
  max-width: 1200px;
  margin: 0 auto;
}

.section-header {
  text-align: center;
  margin-bottom: 80px;
}

.section-title {
  font-size: 48px;
  font-weight: 800;
  margin-bottom: 16px;
  background: linear-gradient(135deg, #e8edf5 0%, #8fa0b8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.section-subtitle {
  font-size: 18px;
  color: #64748b;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 32px;
}

.feature-card {
  padding: 32px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.feature-card:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateY(-8px);
}

.feature-icon-wrapper {
  margin-bottom: 20px;
}

.feature-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
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
  color: #e8edf5;
}

.feature-description {
  font-size: 15px;
  line-height: 1.6;
  color: #8fa0b8;
}

/* How to Use Section */
.how-to-use {
  padding: 120px 8%;
  background: #0f172a;
}

.steps-container {
  display: flex;
  gap: 24px;
  margin-bottom: 60px;
  justify-content: center;
}

.step-card {
  flex: 1;
  max-width: 320px;
  padding: 32px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  position: relative;
  transition: all 0.3s;
}

.step-card:hover {
  background: rgba(255, 255, 255, 0.05);
  transform: translateY(-4px);
}

.step-num {
  font-size: 48px;
  font-weight: 900;
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
  color: #e8edf5;
}

.step-description {
  font-size: 15px;
  line-height: 1.6;
  color: #8fa0b8;
}

.step-arrow {
  position: absolute;
  right: -32px;
  top: 50%;
  transform: translateY(-50%);
  color: #64748b;
  font-size: 24px;
}

/* Pricing Section */
.pricing {
  padding: 120px 8%;
  background: linear-gradient(180deg, #0f172a 0%, #0a0e17 100%);
}

.promo-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(16, 185, 129, 0.15));
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 100px;
  font-size: 15px;
  font-weight: 600;
  color: #22c55e;
  margin-bottom: 24px;
}

.promo-icon {
  font-size: 18px;
}

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 32px;
  max-width: 800px;
  margin: 0 auto;
}

.pricing-card {
  padding: 40px 32px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 20px;
  position: relative;
  transition: all 0.3s;
}

.pricing-card:hover {
  background: rgba(255, 255, 255, 0.05);
  transform: translateY(-8px);
}

.pricing-card.highlighted {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(249, 115, 22, 0.1));
  border-color: rgba(239, 68, 68, 0.3);
  box-shadow: 0 20px 60px rgba(239, 68, 68, 0.2);
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
}

.pricing-name {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 16px;
  color: #e8edf5;
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
  color: #e8edf5;
}

.price-amount {
  font-size: 56px;
  font-weight: 900;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
}

.price-period {
  font-size: 18px;
  color: #64748b;
  font-weight: 500;
}

.pricing-description {
  font-size: 15px;
  color: #8fa0b8;
  margin-bottom: 32px;
}

.pricing-features {
  list-style: none;
  margin-bottom: 32px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pricing-features li {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  color: #e8edf5;
}

.feature-check {
  color: #22c55e;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.pricing-btn {
  width: 100%;
  padding: 16px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  border: none;
  background: rgba(255, 255, 255, 0.05);
  color: #e8edf5;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.pricing-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.pricing-btn.btn-highlighted {
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  color: #fff;
  box-shadow: 0 8px 24px rgba(239, 68, 68, 0.3);
}

.pricing-btn.btn-highlighted:hover {
  box-shadow: 0 12px 32px rgba(239, 68, 68, 0.4);
  transform: translateY(-2px);
}

/* Footer */
.footer {
  padding: 60px 8% 40px;
  background: #0a0e17;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
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
  color: #e8edf5;
}

.footer-logo .logo-sub {
  font-size: 11px;
  color: #64748b;
}

.footer-description {
  font-size: 14px;
  color: #8fa0b8;
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
  color: #e8edf5;
  margin-bottom: 8px;
}

.link-item {
  font-size: 14px;
  color: #8fa0b8;
  text-decoration: none;
  transition: color 0.2s;
}

.link-item:hover {
  color: #f87171;
}

.footer-bottom {
  padding-top: 32px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  text-align: center;
}

.footer-copyright {
  font-size: 14px;
  color: #64748b;
  margin-bottom: 12px;
}

.footer-disclaimer {
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
}

/* Animations */
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

/* Responsive */
@media (max-width: 1024px) {
  .hero {
    flex-direction: column;
    text-align: center;
    padding: 100px 5% 60px;
  }

  .hero-content {
    max-width: 100%;
  }

  .hero-title {
    font-size: 56px;
  }

  .hero-visual {
    max-width: 100%;
  }

  .hero-stats {
    justify-content: center;
  }

  .steps-container {
    flex-direction: column;
    align-items: center;
  }

  .step-arrow {
    display: none;
  }
}

@media (max-width: 768px) {
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

  .section-title {
    font-size: 36px;
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
