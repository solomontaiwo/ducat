import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const { ANALYZE } = loadEnv(mode, '', '')

  return {
  plugins: [
    react(),
    ANALYZE === 'true' && visualizer({
      filename: 'dist/bundle-report.html',
      template: 'treemap',
      gzipSize: true,
      brotliSize: true,
      open: false,
    }),
  ].filter(Boolean),
  base: '/soldi-sotto/',
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          minSize: 20_000,
          groups: [
            { name: 'firebase', test: /node_modules[\\/]firebase[\\/]/, priority: 30 },
            { name: 'motion', test: /node_modules[\\/]framer-motion[\\/]/, priority: 25 },
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router-dom)[\\/]/, priority: 20 },
            { name: 'vendor', test: /node_modules[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
  }
})
