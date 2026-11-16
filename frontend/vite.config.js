import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    {
      // Vite dev 的 html 兜底会把无扩展名路径补成 .html：/ztlive → /ztlive.html，
      // 于是站点页路由 /ztlive 在开发环境会被独立页抢走（生产 Nginx 走 index.html 不会）。
      // 这里把这类同名路由显式交回 SPA，保证 dev / prod 行为一致。
      name: 'duanxian-spa-route-passthrough',
      configureServer(server) {
        const spaPaths = new Set(['/ztlive'])
        server.middlewares.use((req, res, next) => {
          const path = (req.url || '').split('?')[0]
          if (spaPaths.has(path.replace(/\/$/, ''))) {
            req.url = '/index.html'
          }
          next()
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      // 涨停播报独立页（通达信面板直接指向 /ztlive.html），与整站 SPA 各自打包。
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        ztlive: fileURLToPath(new URL('./ztlive.html', import.meta.url)),
      },
      output: {
        // Vite 8 底层是 Rolldown，分包要用 codeSplitting.groups；
        // 旧的 manualChunks 在 codeSplitting 开启时会被忽略。
        //
        // 分组顺序很重要：Vue 运行时必须单独成组，否则会被并进 element-plus，
        // 导致「所有页面都静态依赖 EP」，落地页首屏又被迫预加载 1.1MB。
        codeSplitting: {
          groups: [
            {
              // 图标必须排在 EP 前面：EP 的 package.json 依赖 @element-plus/icons-vue，
              // 分组捕获会顺着依赖把它吸进 EP chunk；而 Landing 只 import 图标，
              // 一旦图标在 EP 里，落地页就会被迫加载 893KB 的组件库。
              name: 'icons',
              test: /node_modules[\\/]@element-plus[\\/]icons-vue[\\/]/,
              priority: 40,
            },
            {
              name: 'vue-vendor',
              test: /node_modules[\\/](@vue|vue|vue-router|pinia)[\\/]/,
              priority: 30,
            },
            {
              name: 'element-plus',
              // 不含 @element-plus/icons-vue：图标由引用方各自 tree-shake。
              // @vueuse 只有 EP 在用，归到这一组，落地页就不用为它买单。
              test: (id) => /node_modules[\\/]element-plus[\\/]/.test(id)
                || /node_modules[\\/]@vueuse[\\/]/.test(id),
              priority: 20,
            },
            {
              name: 'echarts',
              test: /node_modules[\\/]echarts[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
