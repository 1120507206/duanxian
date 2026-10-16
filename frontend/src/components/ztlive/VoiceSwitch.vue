<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { InfoFilled, Lock, Promotion } from '@element-plus/icons-vue'
import { useZtVoice } from '@/composables/useZtVoice'
import { useUserStore } from '@/stores/user'
import { track } from '@/utils/track'
import MemberGateDialog from '@/components/member/MemberGateDialog.vue'

const props = defineProps({
  /** 当前快照行，试听时优先念最近一条真实涨停 */
  rows: { type: Array, default: () => [] },
})

const voice = useZtVoice()
const userStore = useUserStore()
const { settings, engineReady, engineStatus } = voice
const testing = ref(false)
const gateVisible = ref(false)

/** 语音引擎本身不可用（老内核 / 无中文音色）时才真正禁用；会员与否用拦截而不是禁用 */
const engineUnavailable = computed(() => !voice.speechSupported())
const isMember = computed(() => userStore.canUseVoice)

/**
 * 开关状态与会员状态双向同步到语音引擎。
 * 这里是「前端镜像 → 引擎门闩」的唯一入口，避免门闩漏设。
 */
watch(
  isMember,
  (value) => voice.setEntitlement(value),
  { immediate: true },
)

function onToggle(value) {
  if (value && !isMember.value) {
    // 不禁用开关、而是拦截点击：用户点得动才看得到付费引导，
    // 一个灰掉不可点的开关只会让人以为功能坏了。
    gateVisible.value = true
    track('pay_click', { scene: 'voice_switch' })
    return
  }
  voice.setEnabled(value)
  track(value ? 'voice_on' : 'voice_off', { member: isMember.value })
}

function onPreview() {
  testing.value = true
  voice.preview(props.rows)
  // 试听对所有人免费 —— 它是转化钩子：先让人听到价值，再谈付费
  track('voice_preview', { member: isMember.value })
  window.setTimeout(() => {
    testing.value = false
  }, 1200)
}

function openGate() {
  gateVisible.value = true
}

onMounted(() => {
  if (!userStore.ready) userStore.bootstrap()
})
</script>

<template>
  <div class="voice-controls">
    <button
      v-if="!isMember"
      type="button"
      class="voice-lock-chip"
      title="语音播报是会员功能，点击了解"
      @click="openGate"
    >
      <el-icon><Lock /></el-icon>
      <span>语音会员</span>
    </button>
    <button
      v-else
      type="button"
      class="voice-member-chip"
      title="点击续费，会员时长从原到期日叠加"
      @click="openGate"
    >
      <el-icon><Promotion /></el-icon>
      <span>{{ userStore.daysLeft }} 天 · 续费</span>
    </button>

    <button type="button" class="voice-test-btn" :disabled="testing" @click="onPreview">
      {{ testing ? '试听中' : '试听' }}
    </button>

    <el-switch
      class="voice-switch"
      :model-value="settings.enabled"
      :disabled="engineUnavailable"
      inline-prompt
      active-text="语音开"
      inactive-text="语音关"
      @update:model-value="onToggle"
    />

    <el-popover placement="bottom-end" :width="240" trigger="click" popper-class="zt-voice-popper">
      <template #reference>
        <button type="button" class="voice-more-btn" :class="{ 'is-live': engineReady }">
          <el-icon><InfoFilled /></el-icon>
        </button>
      </template>
      <div class="voice-panel">
        <div class="voice-panel-row">
          <span>播报涨停</span>
          <el-switch
            size="small"
            :model-value="settings.announceSealed"
            @update:model-value="(v) => voice.updateSettings({ announceSealed: v })"
          />
        </div>
        <div class="voice-panel-row">
          <span>播报炸板</span>
          <el-switch
            size="small"
            :model-value="settings.announceBlown"
            @update:model-value="(v) => voice.updateSettings({ announceBlown: v })"
          />
        </div>
        <div class="voice-panel-row voice-panel-slider">
          <span>语速 {{ Number(settings.rate).toFixed(1) }}</span>
          <el-slider
            :model-value="Number(settings.rate)"
            :min="0.6"
            :max="1.8"
            :step="0.1"
            size="small"
            @update:model-value="(v) => voice.updateSettings({ rate: v })"
          />
        </div>
        <div class="voice-panel-row voice-panel-slider">
          <span>音量 {{ Math.round(Number(settings.volume) * 100) }}%</span>
          <el-slider
            :model-value="Number(settings.volume)"
            :min="0"
            :max="1"
            :step="0.05"
            size="small"
            @update:model-value="(v) => voice.updateSettings({ volume: v })"
          />
        </div>
        <p class="voice-panel-note">
          语音引擎：{{ engineStatus }} · 仅播报本页打开后新出现的涨停 / 炸板
        </p>
      </div>
    </el-popover>

    <MemberGateDialog v-model="gateVisible" scene="voice_switch" />
  </div>
</template>

<style scoped>
.voice-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.voice-lock-chip,
.voice-member-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.16s ease;
}

.voice-lock-chip {
  background: var(--color-bg-card);
  border-color: var(--color-border);
  color: var(--color-text-muted);
}

.voice-lock-chip:hover {
  color: var(--color-rise);
  border-color: var(--color-rise);
  background: var(--color-rise-soft);
}

.voice-member-chip {
  background: var(--color-rise-soft);
  color: var(--color-rise);
  cursor: pointer;
}

.voice-member-chip:hover {
  filter: brightness(0.96);
}

.voice-test-btn {
  border: 1px solid var(--color-border);
  border-radius: 5px;
  padding: 4px 10px;
  background: var(--color-bg-card);
  color: var(--color-rise);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.16s ease;
  white-space: nowrap;
}

.voice-test-btn:hover:not(:disabled) {
  background: var(--color-rise-soft);
  border-color: var(--color-rise);
}

.voice-test-btn:disabled { opacity: 0.6; cursor: default; }

.voice-more-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.16s ease;
}

.voice-more-btn:hover { color: var(--color-rise); border-color: var(--color-rise); }
.voice-more-btn.is-live { color: var(--color-fall); border-color: var(--color-fall); }

.voice-panel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.voice-panel-slider { flex-direction: column; align-items: stretch; gap: 0; }

.voice-panel-slider :deep(.el-slider) { margin: 0 4px; }

.voice-panel-note {
  margin: 4px 0 0;
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.6;
}
</style>
