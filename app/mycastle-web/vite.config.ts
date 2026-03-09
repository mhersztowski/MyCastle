import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'MyCastle',
        short_name: 'MyCastle',
        description: 'Personal Information Management',
        theme_color: '#1976d2',
        background_color: '#fafafa',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache only small assets — exclude large Monaco workers and main bundle
        globPatterns: ['**/*.{css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/ts.worker*', '**/editor.worker*'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/mqtt/, /^\/ws\//, /^\/files\//, /^\/upload/],
        runtimeCaching: [
          {
            // API and MQTT — always network
            urlPattern: /^\/(api|mqtt|ws|files|upload)\//,
            handler: 'NetworkOnly',
          },
          {
            // JS bundles — serve from cache, update in background
            urlPattern: /\.js$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'js-bundles' },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@modules': path.resolve(__dirname, './src/modules'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
    },
    dedupe: ['react', 'react-dom', '@mui/material', 'dayjs'],
  },
  server: {
    host: true,
    port: 1895,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:1894',
        changeOrigin: true,
      },
      '/mqtt': {
        target: 'ws://localhost:1894',
        ws: true,
      },
      '/ws/terminal': {
        target: 'ws://localhost:1894',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'build',
  },
});
