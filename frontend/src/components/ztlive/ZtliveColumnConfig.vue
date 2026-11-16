<script setup>
/**
 * 表头列配置（原生实现）。
 *
 * 对齐旧项目 `src/components/TableColumnConfig.vue` 的交互：
 *   · 名称表头里的齿轮按钮，点开一个浮层；
 *   · 浮层里可拖拽调整列顺序、勾选控制显示 / 隐藏、一键重置；
 *   · 名称列固定第一列，不参与配置。
 *
 * 为什么不用 el-popover + el-checkbox：
 *   通达信独立页正在逐步摆脱 el-table，这个浮层如果继续依赖 EP，面板内核越老
 *   越容易出定位 / 层级问题。这里用 Teleport + fixed 定位 + 原生 checkbox，
 *   两套宿主（/ztlive 和 /ztlive.html）行为完全一致。
 *
 * 拖拽用原生 HTML5 drag 实现（不引入 SortableJS）；触屏或拖拽不生效时，
 * 每行还提供 ↑ / ↓ 按钮兜底。
 */
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

const props = defineProps({
  /** 可配置列（不含固定的名称列）：[{ key, label }] */
  columns: { type: Array, default: () => [] },
  /** 当前配置，按显示顺序：[{ key, visible }] */
  modelValue: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'reset'])

const open = ref(false)
const triggerRef = ref(null)
const panelRef = ref(null)
const panelStyle = ref({})
const hint = ref('')
let hintTimer = null

/** 配置还没初始化时，按「全部显示、默认顺序」兜底 */
const items = computed(() => (
  props.modelValue.length
    ? props.modelValue
    : props.columns.map((column) => ({ key: column.key, visible: true }))
))

const labelMap = computed(() => new Map(props.columns.map((column) => [column.key, column.label])))
const labelOf = (key) => labelMap.value.get(key) || key

function flashHint(message) {
  hint.value = message
  if (hintTimer) clearTimeout(hintTimer)
  hintTimer = setTimeout(() => {
    hint.value = ''
    hintTimer = null
  }, 1800)
}

/* ══════════ 显示 / 隐藏 ══════════ */

function onToggle(key, event) {
  const nextVisible = Boolean(event.target.checked)
  const visibleCount = items.value.filter((item) => item.visible).length

  // 至少保留一列，否则表头会空掉、用户也找不回入口
  if (!nextVisible && visibleCount <= 1) {
    event.target.checked = true
    flashHint('至少保留一列')
    return
  }

  emit('update:modelValue', items.value.map((item) => (
    item.key === key ? { ...item, visible: nextVisible } : item
  )))
}

/* ══════════ 排序（拖拽 + 上下移） ══════════ */

const dragFrom = ref(-1)
const dragOver = ref(-1)
const dragArmed = ref(false)

function onHandleDown() {
  dragArmed.value = true
}

function onDragStart(event, index) {
  if (!dragArmed.value) {
    event.preventDefault()
    return
  }
  dragFrom.value = index
  dragOver.value = index
  event.dataTransfer.effectAllowed = 'move'
  try {
    event.dataTransfer.setData('text/plain', String(index))
  } catch (_) {
    /* 部分内核不允许写 dataTransfer，拖拽本身仍可用 */
  }
}

function onDragOver(index) {
  if (dragFrom.value < 0) return
  dragOver.value = index
}

function onDrop(event, index) {
  event.preventDefault()
  const from = dragFrom.value
  dragFrom.value = -1
  dragOver.value = -1
  dragArmed.value = false
  if (from < 0 || from === index) return
  moveItem(from, index)
}

function onDragEnd() {
  dragFrom.value = -1
  dragOver.value = -1
  dragArmed.value = false
}

function moveItem(from, to) {
  if (from === to || from < 0 || to < 0 || to >= items.value.length) return
  const next = [...items.value]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  emit('update:modelValue', next)
}

function shift(index, delta) {
  moveItem(index, index + delta)
}

/* ══════════ 浮层定位与关闭 ══════════ */

const PANEL_WIDTH = 250

function positionPanel() {
  const trigger = triggerRef.value
  if (!trigger) return

  const rect = trigger.getBoundingClientRect()
  const panelHeight = panelRef.value?.offsetHeight || 320
  const margin = 8

  let left = rect.left
  if (left + PANEL_WIDTH > window.innerWidth - margin) {
    left = window.innerWidth - PANEL_WIDTH - margin
  }
  left = Math.max(margin, left)

  let top = rect.bottom + 6
  if (top + panelHeight > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - panelHeight - 6)
  }

  panelStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${PANEL_WIDTH}px`,
  }
}

function onDocumentDown(event) {
  if (panelRef.value?.contains(event.target)) return
  if (triggerRef.value?.contains(event.target)) return
  closePanel()
}

/**
 * 页面 / 表格滚动时关闭浮层（否则面板会停在旧位置）。
 *
 * 但浮层**自己列表**的滚动必须放过：勾选靠后的列时，浏览器可能先把该行滚进
 * 可视区，这个 scroll 事件会冒到 window 上 —— 之前就是它把面板关掉，
 * 表现为「点一下复选框，面板没了」。
 */
function onWindowScroll(event) {
  if (panelRef.value?.contains(event.target)) return
  closePanel()
}

function openPanel() {
  open.value = true
  nextTick(() => {
    positionPanel()
    // 面板渲染后高度才确定，再校一次位置（避免贴底时被截断）
    requestAnimationFrame(positionPanel)
  })
  document.addEventListener('mousedown', onDocumentDown, true)
  window.addEventListener('resize', closePanel)
  window.addEventListener('scroll', onWindowScroll, true)
}

function closePanel() {
  if (!open.value) return
  open.value = false
  document.removeEventListener('mousedown', onDocumentDown, true)
  window.removeEventListener('resize', closePanel)
  window.removeEventListener('scroll', onWindowScroll, true)
}

function togglePanel() {
  if (open.value) closePanel()
  else openPanel()
}

function onReset() {
  emit('reset')
  flashHint('已恢复默认列')
  nextTick(positionPanel)
}

onBeforeUnmount(() => {
  closePanel()
  if (hintTimer) clearTimeout(hintTimer)
})
</script>

<template>
  <button
    ref="triggerRef"
    type="button"
    class="nzc-trigger"
    title="表头设置：排序 / 显示"
    aria-label="表头设置"
    :aria-expanded="open"
    @click.stop="togglePanel"
  >
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      ref="panelRef"
      class="nzc-panel"
      :style="panelStyle"
      role="dialog"
      aria-label="表头设置"
      @click.stop
    >
      <div class="nzc-head">
        <span>拖拽排序 / 勾选显示</span>
        <button type="button" class="nzc-reset" @click="onReset">重置</button>
      </div>

      <ul class="nzc-list">
        <li
          v-for="(item, index) in items"
          :key="item.key"
          class="nzc-item"
          :class="{
            'is-dragging': dragFrom === index,
            'is-drop-target': dragOver === index && dragFrom !== index,
          }"
          draggable="true"
          @dragstart="onDragStart($event, index)"
          @dragover.prevent="onDragOver(index)"
          @drop="onDrop($event, index)"
          @dragend="onDragEnd"
        >
          <span class="nzc-handle" title="拖拽排序" @mousedown="onHandleDown">⋮⋮</span>
          <input
            :id="`nzc-${item.key}`"
            type="checkbox"
            class="nzc-check"
            :checked="item.visible"
            @change="onToggle(item.key, $event)"
          >
          <label class="nzc-label" :for="`nzc-${item.key}`">{{ labelOf(item.key) }}</label>
          <span class="nzc-moves">
            <button
              type="button"
              class="nzc-move"
              :disabled="index === 0"
              title="上移"
              @click="shift(index, -1)"
            >↑</button>
            <button
              type="button"
              class="nzc-move"
              :disabled="index === items.length - 1"
              title="下移"
              @click="shift(index, 1)"
            >↓</button>
          </span>
        </li>
      </ul>

      <p v-if="hint" class="nzc-hint">{{ hint }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
.nzc-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  flex-shrink: 0;
}

.nzc-trigger:hover {
  color: var(--color-rise);
  background: var(--color-rise-soft);
}

.nzc-panel {
  position: fixed;
  z-index: 3000;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-elevated);
  box-shadow: var(--shadow-card-hover);
  color: var(--color-text-primary);
  font-size: 12.5px;
}

.nzc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.nzc-reset {
  padding: 2px 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--color-rise);
  font-size: 12px;
  cursor: pointer;
}

.nzc-reset:hover {
  background: var(--color-rise-soft);
}

.nzc-list {
  margin: 0;
  padding: 0;
  max-height: 300px;
  overflow: auto;
  list-style: none;
}

.nzc-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 2px;
  border-radius: 6px;
  transition: background-color 0.15s ease;
}

.nzc-item:hover {
  background: var(--color-bg-card-hover);
}

.nzc-item.is-dragging {
  opacity: 0.45;
}

.nzc-item.is-drop-target {
  box-shadow: inset 0 2px 0 var(--color-rise);
}

.nzc-handle {
  color: var(--color-text-muted);
  cursor: grab;
  user-select: none;
  letter-spacing: -2px;
  line-height: 1;
}

.nzc-handle:active {
  cursor: grabbing;
}

.nzc-check {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--color-rise);
  cursor: pointer;
}

.nzc-label {
  flex: 1;
  overflow: hidden;
  color: var(--color-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.nzc-moves {
  display: inline-flex;
  gap: 2px;
  /* 常驻 45% 透明度：触屏没有 hover，不能只靠悬停才显示上下移按钮 */
  opacity: 0.45;
  transition: opacity 0.15s ease;
}

.nzc-item:hover .nzc-moves,
.nzc-moves:focus-within {
  opacity: 1;
}

.nzc-move {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-card);
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

.nzc-move:hover:not(:disabled) {
  border-color: var(--color-rise);
  color: var(--color-rise);
}

.nzc-move:disabled {
  opacity: 0.35;
  cursor: default;
}

.nzc-hint {
  margin: 6px 0 0;
  color: var(--color-rise);
  font-size: 11.5px;
}
</style>
