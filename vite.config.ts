import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const KEY_PATH = path.join(__dirname, 'certs', 'key.pem')
const CERT_PATH = path.join(__dirname, 'certs', 'cert.pem')

function loadHttps() {
  if (process.env.DWES_HTTPS !== '1') return undefined
  if (!fs.existsSync(KEY_PATH) || !fs.existsSync(CERT_PATH)) {
    console.warn('[vite] DWES_HTTPS enabled but certs missing — run: npm run certs:generate')
    return undefined
  }
  return {
    key: fs.readFileSync(KEY_PATH),
    cert: fs.readFileSync(CERT_PATH),
  }
}

const https = loadHttps()
const dwesHostname = process.env.DWES_HOSTNAME?.trim() || 'dwes.local'
const httpsGatewayPort = String(
  process.env.VITE_PORT || process.env.DWES_HTTPS_PORT || '5173',
)
function resolveProxyTarget() {
  if (process.env.VITE_API_PROXY) return process.env.VITE_API_PROXY
  const runtimePortFile = path.join(__dirname, 'backend', '.dwes-port')
  if (fs.existsSync(runtimePortFile)) {
    const port = fs.readFileSync(runtimePortFile, 'utf8').trim()
    if (/^\d+$/.test(port)) return `http://127.0.0.1:${port}`
  }
  return 'http://127.0.0.1:3001'
}
const proxyTarget = resolveProxyTarget()
const vitePort = Number(process.env.VITE_INTERNAL_PORT) || 5175
const viteHost = process.env.VITE_INTERNAL_HOST ?? true

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_DWES_HOSTNAME': JSON.stringify(dwesHostname),
    'import.meta.env.VITE_DWES_HTTPS_PORT': JSON.stringify(httpsGatewayPort),
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  server: {
    host: viteHost,
    port: vitePort,
    strictPort: true,
    allowedHosts: true,
    https,
    watch: {
      // Never watch git worktrees under .claude/ — they are full repo copies whose
      // builds/installs would otherwise churn this dev server (phantom HMR / reloads).
      ignored: ['**/.claude/**'],
    },
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: viteHost,
    port: vitePort,
    strictPort: true,
    allowedHosts: true,
    https,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
