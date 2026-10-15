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
        manualChunks(id) {
          if (id.includes('node_modules/echarts')) return 'echarts'
          if (id.includes('node_modules/element-plus')) return 'element-plus'
          if (id.includes('node_modules/@element-plus')) return 'element-plus'
          if (id.includes('node_modules/vue') || id.includes('node_modules/pinia') || id.includes('node_modules/vue-router')) {
            return 'vue-vendor'
          }
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
