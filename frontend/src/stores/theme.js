import { defineStore } from 'pinia'

/**
 * 主题模式（浅色 / 深色）状态管理。
 *
 * 设计要点：
 * - 默认浅色（light）。首次访问（无 localStorage 记录）时使用浅色。
 * - 通过 localStorage 键 `duanxian:themeMode` 持久化，刷新后保持。
 * - 每次变更都同步 `<html>` 的 `dark` class 与 `color-scheme`，
 *   让 `main.css` 中的 `html.dark` 令牌覆盖生效。
 */
const STORAGE_KEY = 'duanxian:themeMode'
const VALID_MODES = ['light', 'dark']

/** 读取初始主题：localStorage 合法值优先，否则回退浅色。 */
function readStoredMode() {
  if (typeof window === 'undefined') return 'light'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && VALID_MODES.includes(stored)) return stored
  } catch (error) {
    // localStorage 在隐私模式/被禁用时可能抛错，静默回退到默认浅色
    console.warn('[theme] 读取主题失败，回退浅色:', error)
  }
  return 'light'
}

/** 将主题应用到 <html> 元素，同步 dark class 与 color-scheme。 */
function applyDomMode(mode) {
  if (typeof document === 'undefined') return
  const isDark = mode === 'dark'
  const root = document.documentElement
  root.classList.toggle('dark', isDark)
  root.style.colorScheme = isDark ? 'dark' : 'light'
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    mode: readStoredMode(),
  }),

  getters: {
    /** 是否深色模式。 */
    isDark: (state) => state.mode === 'dark',
    /** 是否浅色模式。 */
    isLight: (state) => state.mode === 'light',
  },

  actions: {
    /**
     * 设置主题模式。
     * @param {'light'|'dark'} mode 目标主题
     */
    setMode(mode) {
      const next = VALID_MODES.includes(mode) ? mode : 'light'
      this.mode = next
      applyDomMode(next)
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_KEY, next)
        } catch (error) {
          console.warn('[theme] 写入主题失败:', error)
        }
      }
    },

    /** 在浅色 / 深色之间切换。 */
    toggle() {
      this.setMode(this.mode === 'dark' ? 'light' : 'dark')
    },

    /** 根据当前 state 重新应用到 DOM（挂载时调用，确保与内联脚本一致）。 */
    sync() {
      applyDomMode(this.mode)
    },
  },
})

export default useThemeStore
