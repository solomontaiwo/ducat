import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const { ANALYZE } = loadEnv(mode, '', '')
  // Both packaged shells load their bundle from the app container root.
  const embedded = mode === 'desktop' || mode === 'mobile'
  const desktop = mode === 'desktop'

  return {
  plugins: [
    react(),
    desktop && {
      name: 'desktop-content-security-policy',
      transformIndexHtml(html) {
        return html.replace("connect-src 'self'", "connect-src 'self' ipc: http://ipc.localhost")
          .replace('; upgrade-insecure-requests', '')
      },
    },
    ANALYZE === 'true' && visualizer({
      filename: 'dist/bundle-report.html',
      template: 'treemap',
      gzipSize: true,
      brotliSize: true,
      open: false,
    }),
  ].filter(Boolean),
  base: embedded ? '/' : '/soldi-sotto/',
  build: {
    rollupOptions: {
      output: {
        // Only split stable, framework-level vendors (Firebase stays split per
        // capability by dynamic imports, so app-check/functions load on demand). A catch-all "vendor" group
        // would merge lazy libraries (recharts, jspdf, html2canvas) into one
        // chunk and defeat route-level code splitting.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
          if (/node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) return 'motion'
          return undefined
        },
      },
    },
  },
  }
})
