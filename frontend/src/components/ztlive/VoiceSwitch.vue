<script setup>
import { computed, ref } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'
import { useZtVoice } from '@/composables/useZtVoice'

const props = defineProps({
  /** 当前快照行，试听时优先念最近一条真实涨停 */
  rows: { type: Array, default: () => [] },
})

const voice = useZtVoice()
const { settings, engineReady, engineStatus } = voice
const testing = ref(false)

const switchDisabled = computed(() => !voice.speechSupported())

function onToggle(value) {
  voice.setEnabled(value)
}

function onPreview() {
  testing.value = true
  voice.preview(props.rows)
  window.setTimeout(() => {
    testing.value = false
  }, 1200)
}
</script>

<template>
  <div class="voice-controls">
    <button type="button" class="voice-test-btn" :disabled="testing" @click="onPreview">
      {{ testing ? '试听中' : '试听' }}
    </button>
    <el-switch
      class="voice-switch"
      :model-value="settings.enabled"
      :disabled="switchDisabled"
      inline-prompt
      active-text="语音开"
      inactive-text="语音关"
      @update:model-value="onToggle"
    />
    <el-popover placement="bottom-end" :width="230" trigger="click" popper-class="zt-voice-popper">
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
  </div>
</template>

<style scoped>
.voice-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.voice-test-btn {
  border: 1px solid rgba(248, 113, 113, 0.45);
  border-radius: 5px;
  padding: 4px 10px;
  background: rgba(239, 68, 68, 0.12);
  color: #fca5a5;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.16s ease;
  white-space: nowrap;
}

.voice-test-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(248, 113, 113, 0.7);
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

.voice-more-btn:hover { color: #fca5a5; border-color: rgba(248, 113, 113, 0.6); }
.voice-more-btn.is-live { color: #4ade80; border-color: rgba(34, 197, 94, 0.45); }

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

