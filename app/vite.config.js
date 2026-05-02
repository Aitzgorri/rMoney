import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Tauri expects a fixed dev server port and a relative base path in production.
  server: {
    port: 5173,
    strictPort: true,  // fail if 5173 is taken rather than trying another port
    proxy: {
      '/ai-proxy/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/ai-proxy\/anthropic/, ''),
      },
      '/ai-proxy/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/ai-proxy\/openai/, ''),
      },
      // CORS-bypass proxies for market data providers that lack ACAO headers.
      // In Tauri production these calls go through @tauri-apps/plugin-http instead.
      '/__yfproxy': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/__yfproxy/, ''),
      },
      '/__stooq': {
        target: 'https://stooq.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/__stooq/, ''),
      },
    },
  },
  // Relative paths so Tauri can load files from dist/ without a web server.
  base: './',
})
