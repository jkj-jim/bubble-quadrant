import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { semiTheming } from 'vite-plugin-semi-theming'

// https://vite.dev/config/
export default defineConfig({
  base: './', // 重要：飞书插件要求
  plugins: [
    react(),
    semiTheming({
      theme: '@semi-bot/semi-theme-feishu-dashboard',
    }),
  ],
  server: {
    host: '0.0.0.0',
    cors: true,
    headers: {
      'Access-Control-Allow-Private-Network': 'true',
      'Access-Control-Allow-Origin': '*',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React 相关库单独打包
          'react-vendor': ['react', 'react-dom'],
          // ECharts 单独打包 (最大的库)
          'echarts': ['echarts'],
          // Semi UI 单独打包
          'semi-ui': ['@douyinfe/semi-ui'],
          // 国际化库单独打包
          'i18n': ['i18next', 'react-i18next'],
        },
      },
    },
  },
})
