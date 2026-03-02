import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const KEYCLOAK_PROXY_PATH = '/keycloak'
const KEYCLOAK_TARGET = 'http://localhost:8180'

// Plugin: handle CORS for Keycloak proxy so browser extensions (e.g. x-firephp-version) don't break preflight
function keycloakCorsPlugin() {
  return {
    name: 'keycloak-cors',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'OPTIONS' || !req.url?.startsWith(KEYCLOAK_PROXY_PATH)) {
          next()
          return
        }
        const origin = req.headers.origin || 'http://localhost:5174'
        res.writeHead(204, {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        })
        res.end()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [keycloakCorsPlugin(), react()],
  server: {
    port: 5174,
    proxy: {
      [KEYCLOAK_PROXY_PATH]: {
        target: KEYCLOAK_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(new RegExp(`^${KEYCLOAK_PROXY_PATH}`), ''),
      },
    },
  },
})
