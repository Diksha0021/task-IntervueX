import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const API_TARGET = 'http://127.0.0.1:5000'

function apiProxyConfig() {
  return {
    target: API_TARGET,
    changeOrigin: true,
    secure: false,
    configure(proxy) {
      proxy.on('error', (err, _req, res) => {
        console.warn(
          '[vite] API proxy error — start the backend: npm run dev:server',
          err.message
        )
        if (res && !res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              error:
                'API server is not running. In the Ai-interview folder run: npm run dev:server',
            })
          )
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': apiProxyConfig(),
      '/health': { target: API_TARGET, changeOrigin: true, secure: false },
      '/ws': { target: API_TARGET, ws: true },
      '/socket.io': { target: API_TARGET, ws: true, changeOrigin: true },
    },
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: false,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true, secure: false },
      '/health': { target: API_TARGET, changeOrigin: true, secure: false },
      '/ws': { target: API_TARGET, ws: true },
      '/socket.io': { target: API_TARGET, ws: true, changeOrigin: true },
    },
  },
})
