<script setup>
import { computed, onMounted } from 'vue'
import { useMarketStore } from '@/stores/market'

const store = useMarketStore()
onMounted(() => store.loadLonghu())

const filteredList = computed(() => store.longhuList)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">龙虎榜</h2>
      <div class="header-actions">
        <span class="update-time">{{ new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }) }}</span>
        <el-button size="small" @click="store.refreshLonghu()">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>
    </div>

    <div class="longhu-list">
      <div v-for="item in filteredList" :key="item.code" class="longhu-card">
        <div class="lh-header">
          <div class="lh-stock">
            <span class="lh-name">{{ item.name }}</span>
            <span class="lh-code">{{ item.code }}</span>
          </div>
          <div class="lh-price-row">
            <span class="lh-pct" :class="Number(item.pct) >= 0 ? 'text-rise' : 'text-fall'">
              {{ Number(item.pct) >= 0 ? '+' : '' }}{{ item.pct }}%
            </span>
            <span class="lh-price">{{ item.price }}</span>
          </div>
        </div>
        <div class="lh-reason">{{ item.reason }}</div>

        <div class="lh-flow">
          <div class="lh-side">
            <div class="lh-side-title buy-title">
              <span class="side-dot buy-dot" />买入
            </div>
            <div v-for="b in item.buyList" :key="b.dept" class="lh-trader">
              <span class="lh-trader-name">{{ b.name }}</span>
              <span class="lh-dept">{{ b.dept }}</span>
              <span class="lh-amount text-rise">{{ b.amount }}万</span>
            </div>
            <div class="lh-total buy-total">
              <span>合计</span>
              <span class="text-rise font-bold">{{ item.buyTotal }}万</span>
            </div>
          </div>
          <div class="lh-divider" />
          <div class="lh-side">
            <div class="lh-side-title sell-title">
              <span class="side-dot sell-dot" />卖出
            </div>
            <div v-for="b in item.sellList" :key="b.dept" class="lh-trader">
              <span class="lh-trader-name">{{ b.name }}</span>
              <span class="lh-dept">{{ b.dept }}</span>
              <span class="lh-amount text-fall">{{ b.amount }}万</span>
            </div>
            <div class="lh-total sell-total">
              <span>合计</span>
              <span class="text-fall font-bold">{{ item.sellTotal }}万</span>
            </div>
          </div>
        </div>

        <div class="lh-net">
          <span class="net-label">净买入</span>
          <span class="net-value" :class="Number(item.netFlow) >= 0 ? 'text-rise' : 'text-fall'">
            {{ Number(item.netFlow) >= 0 ? '+' : '' }}{{ item.netFlow }}万
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.header-actions { display: flex; align-items: center; gap: 12px; }
.update-time { font-size: 12px; color: #5a6e88; }

.longhu-list { display: flex; flex-direction: column; gap: 14px; }

.longhu-card {
  background: linear-gradient(135deg, #141e30, #1a2740);
  border: 1px solid #1e3a5f;
  border-radius: 10px;
  padding: 18px;
  transition: all 0.3s;
}
.longhu-card:hover {
  border-color: #253d5f;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3), 0 0 2px rgba(59,130,246,0.08);
  transform: translateY(-1px);
}

.lh-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 8px;
}

.lh-name { font-size: 16px; font-weight: 700; color: #e8edf5; }
.lh-code { font-size: 11px; color: #5a6e88; margin-left: 8px; }
.lh-price-row { text-align: right; }
.lh-pct { font-size: 16px; font-weight: 700; }
.lh-price { display: block; font-size: 12px; color: #8fa0b8; margin-top: 1px; }

.lh-reason {
  font-size: 12px;
  color: #5a6e88;
  margin-bottom: 14px;
  padding: 4px 10px;
  background: rgba(255,255,255,0.02);
  border-radius: 4px;
  display: inline-block;
}

.lh-flow { display: flex; gap: 20px; }
.lh-side { flex: 1; }
.lh-divider { width: 1px; background: linear-gradient(180deg, transparent, #1e3a5f 20%, #1e3a5f 80%, transparent); }

.lh-side-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.buy-title { color: #ef4444; }
.sell-title { color: #22c55e; }
.side-dot { width: 6px; height: 6px; border-radius: 50%; }
.buy-dot { background: #ef4444; box-shadow: 0 0 4px rgba(239,68,68,0.5); }
.sell-dot { background: #22c55e; box-shadow: 0 0 4px rgba(34,197,94,0.5); }

.lh-trader {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
}
.lh-trader-name {
  color: #f97316;
  font-weight: 600;
  font-size: 11px;
  min-width: 45px;
}
.lh-dept { color: #c8d6e5; flex: 1; font-size: 12px; }
.lh-amount { font-weight: 600; font-variant-numeric: tabular-nums; }

.lh-total {
  display: flex;
  justify-content: space-between;
  padding-top: 8px;
  margin-top: 6px;
  border-top: 1px solid rgba(30,58,95,0.6);
  font-size: 13px;
  color: #e8edf5;
}

.lh-net {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(30,58,95,0.6);
}
.net-label { font-size: 13px; color: #8fa0b8; }
.net-value { font-size: 16px; font-weight: 700; }

@media (max-width: 768px) {
  .lh-flow { flex-direction: column; }
  .lh-divider { width: auto; height: 1px; }
}
</style>
