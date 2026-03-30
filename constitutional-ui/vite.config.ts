import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const ferpApiKey = env.VITE_FERP_API_KEY ?? 'change-me'
  const ihApiKey = env.VITE_IH_API_KEY ?? 'change-me'

  function injectHeader(key: string, value: string) {
    return {
      configure(proxy: import('http-proxy').Server) {
        proxy.on('proxyReq', (proxyReq) => {
          proxyReq.setHeader(key, value)
        })
      }
    }
  }

  function injectIhAuth() {
    return {
      configure(proxy: import('http-proxy').Server) {
        proxy.on('proxyReq', (proxyReq) => {
          proxyReq.setHeader('x-api-key', ihApiKey)
        })
      }
    }
  }

  function injectFerpAuth() {
    return {
      configure(proxy: import('http-proxy').Server) {
        proxy.on('proxyReq', (proxyReq) => {
          proxyReq.setHeader('x-api-key', ferpApiKey)
          proxyReq.setHeader('x-ingress-id', 'foundation-ingress')
        })
      }
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        // Auth — FoundationERP (no extra headers needed, mounted before guards)
        "/auth": {
          target: "http://localhost:3000",
          changeOrigin: true
        },
        // Integration Hub: process state + actions
        "/process": {
          target: "http://localhost:4017",
          changeOrigin: true,
          ...injectIhAuth()
        },
        // Integration Hub: MCP catalog
        "/mcp": {
          target: "http://localhost:4017",
          changeOrigin: true,
          ...injectIhAuth()
        },
        // Integration Hub: hub sessions, navlog, governance (must come before generic /api)
        "/api/v1/hub": {
          target: "http://localhost:4017",
          changeOrigin: true,
          ...injectIhAuth()
        },
        // FoundationERP: events, query, domain routes
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true,
          ...injectFerpAuth()
        }
      }
    }
  }
})
