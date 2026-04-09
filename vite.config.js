import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const devProxyTarget =
  process.env.VITE_API_URL || process.env.REACT_APP_API_URL || 'http://localhost:5000'

const browserApiUrl = process.env.VITE_API_URL || process.env.REACT_APP_API_URL || ''

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.REACT_APP_API_URL': JSON.stringify(browserApiUrl),
  },
  server: {
    proxy: {
      '/api': {
        target: devProxyTarget,
        changeOrigin: true,
      },
    },
  },
})
