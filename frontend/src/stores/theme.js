import { defineStore } from 'pinia'

/**
 * 主题模式（浅色 / 深色）状态管理。
 *
 * 设计要点：
 * - 主站默认 `light`；独立页（通达信面板）默认 `dark`。
 * - 通过 localStorage 持久化，刷新后保持。主站与独立页使用**不同的存储键**，
 *   避免主站切换主题时把嵌在面板里的独立页一起带偏。
 * - 每次变更都同步 `<html>` 的 `dark` class 与 `color-scheme`，
 *   让 `main.css` 中的 `html.dark` 令牌覆盖生效。
 */
const VALID_MODES = ['light', 'dark']

/** 主站（整站 SPA）主题存储键，默认浅色。 */
export const SITE_STORAGE_KEY = 'duanxian:themeMode'
/** 独立页（ztlive.html）主题存储键，默认深色。 */
export const EMBED_STORAGE_KEY = 'duanxian:ztliveTheme'

/**
 * 读取指定存储键下的主题。
 * @param {string} key localStorage 键
 * @param {'light'|'dark'} fallback 无有效记录时的回退值
 */
function readStoredMode(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const stored = window.localStorage.getItem(key)
    if (stored && VALID_MODES.includes(stored)) return stored
  } catch (error) {
    // localStorage 在隐私模式/被禁用时可能抛错，静默回退
    console.warn('[theme] 读取主题失败，回退默认值:', error)
  }
  return fallback
}

/** 将主题应用到 <html> 元素，同步 dark class 与 color-scheme。 */
function applyDomMode(mode) {
  if (typeof document === 'undefined') return
  const isDark = mode === 'dark'
  const root = document.documentElement
  root.classList.toggle('dark', isDark)
  root.style.colorScheme = isDark ? 'dark' : 'light'
}

/**
 * 创建主题 store。
 *
 * @param {{ storageKey?: string, defaultMode?: 'light'|'dark' }} options
 *   storageKey：持久化键，默认主站键；defaultMode：无记录时回退，默认 light。
 */
export function createThemeStore(options = {}) {
  const {
    storageKey = SITE_STORAGE_KEY,
    defaultMode = 'light',
  } = options

  return defineStore(`theme:${storageKey}`, {
    state: () => ({
      mode: readStoredMode(storageKey, defaultMode),
      storageKey,
      defaultMode,
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
        const next = VALID_MODES.includes(mode) ? mode : this.defaultMode
        this.mode = next
        applyDomMode(next)
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(this.storageKey, next)
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
}

/** 主站主题 store（默认浅色）。 */
export const useThemeStore = createThemeStore({
  storageKey: SITE_STORAGE_KEY,
  defaultMode: 'light',
})

/** 独立页主题 store（默认深色，独立存储键）。 */
export const useEmbedThemeStore = createThemeStore({
  storageKey: EMBED_STORAGE_KEY,
  defaultMode: 'dark',
})

export default useThemeStore
