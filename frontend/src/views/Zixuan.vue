<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useZixuanStore } from '@/stores/zixuan'

const store = useZixuanStore()
const showAdd = ref(false)
const addForm = ref({ code: '', name: '' })

onMounted(() => {
  store.loadFromServer()
})

async function onAdd() {
  if (!addForm.value.code || !addForm.value.name) {
    ElMessage.warning('请输入股票代码和名称')
    return
  }

  if (!/^\d{6}$/.test(addForm.value.code)) {
    ElMessage.warning('股票代码必须是 6 位数字')
    return
  }

  const ok = await store.addStock({
    code: addForm.value.code,
    name: addForm.value.name,
  })

  if (ok) {
    ElMessage.success('添加成功')
    addForm.value = { code: '', name: '' }
    showAdd.value = false
    return
  }

  ElMessage.warning('该股票已在自选列表中')
}

function onRemove(code, name) {
  ElMessageBox.confirm(`确定删除 ${name} 吗？`, '提示', { type: 'warning' })
    .then(() => {
      store.removeStock(code)
      ElMessage.success('已删除')
    })
    .catch(() => {})
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">自选股</h2>
      <el-button size="small" type="primary" @click="showAdd = true">
        <el-icon><Plus /></el-icon>添加自选
      </el-button>
    </div>

    <el-dialog v-model="showAdd" title="添加自选股" width="380px">
      <el-form label-width="70px">
        <el-form-item label="股票代码">
          <el-input v-model="addForm.code" placeholder="6 位数字代码" maxlength="6" />
        </el-form-item>
        <el-form-item label="股票名称">
          <el-input v-model="addForm.name" placeholder="如：贵州茅台" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" @click="onAdd">确定添加</el-button>
      </template>
    </el-dialog>

    <div v-if="store.stocks.length === 0" class="empty-state">
      <div class="empty-icon">
        <el-icon :size="40" color="#475569"><Star /></el-icon>
      </div>
      <p class="empty-text">暂无自选股</p>
      <p class="empty-sub">点击右上角“添加自选”按钮，把你关注的股票加入列表。</p>
    </div>

    <div v-else class="zixuan-grid">
      <div
        v-for="stock in store.stocks"
        :key="stock.code"
        class="zx-card"
        :class="Number(stock.pct) >= 0 ? 'zx-rise' : 'zx-fall'"
      >
        <div class="zx-header">
          <div>
            <span class="zx-name">{{ stock.name }}</span>
            <span class="zx-code">{{ stock.code }}</span>
          </div>
          <button class="zx-del" title="删除" @click="onRemove(stock.code, stock.name)">&times;</button>
        </div>
        <div class="zx-price-row">
          <span class="zx-price">{{ stock.price }}</span>
          <span :class="['zx-pct-badge', Number(stock.pct) >= 0 ? 'bg-rise-soft text-rise' : 'bg-fall-soft text-fall']">
            {{ Number(stock.pct) >= 0 ? '+' : '' }}{{ stock.pct }}%
          </span>
        </div>
        <div class="zx-meta">
          <span class="zx-updated">实时</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.empty-state { text-align: center; padding: 100px 0; }

.empty-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.03);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

.empty-text { font-size: 16px; font-weight: 600; color: #8fa0b8; margin: 0 0 4px; }
.empty-sub { font-size: 13px; color: #5a6e88; margin: 0; }

.zixuan-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.zx-card {
  background: linear-gradient(145deg, #141e30, #1e2d45);
  border: 1px solid #1e3a5f;
  border-radius: 10px;
  padding: 16px;
  transition: all 0.3s;
  position: relative;
  overflow: hidden;
}

.zx-card:hover {
  border-color: #253d5f;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}

.zx-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 100%;
}

.zx-rise::before { background: linear-gradient(180deg, #ef4444, rgba(239, 68, 68, 0.2)); }
.zx-fall::before { background: linear-gradient(180deg, #22c55e, rgba(34, 197, 94, 0.2)); }

.zx-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.zx-name { font-size: 16px; font-weight: 700; color: #e8edf5; }
.zx-code { font-size: 11px; color: #5a6e88; margin-left: 6px; }

.zx-del {
  background: none;
  border: none;
  color: #475569;
  font-size: 20px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  border-radius: 4px;
  transition: all 0.15s;
}

.zx-del:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); }

.zx-price-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.zx-price { font-size: 22px; font-weight: 800; color: #e8edf5; font-variant-numeric: tabular-nums; }
.zx-pct-badge { font-size: 14px; font-weight: 700; padding: 3px 10px; border-radius: 6px; }

.zx-meta { display: flex; align-items: center; }

.zx-updated {
  font-size: 10px;
  color: #22c55e;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
}

.zx-updated::before {
  content: '';
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #22c55e;
}
</style>
