import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

// One build → Mobile browser + PC browser (PWA), Electron (desktop/),
// and Capacitor (mobile/) all consume the same dist/.
export default defineConfig({
  root: 'web',
  base: './', // relative paths so file:// works inside Electron & Capacitor
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'web/index.html'),
        overlay: resolve(__dirname, 'web/overlay.html'),
      },
    },
  },
  // allowedHosts keeps proxied preview hosts (and LAN/tunnel names) working.
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'No7 Personal AI Bot',
        short_name: 'No7 AI',
        description: 'Thai-first voice AI companion — Mobile + PC',
        theme_color: '#0b0f1a',
        background_color: '#0b0f1a',
        display: 'standalone',
        orientation: 'any',
        lang: 'th',
        id: '/?app=no7',
        start_url: '.',
        scope: '.',
        categories: ['productivity', 'utilities'],
        shortcuts: [
          { name: 'แชทใหม่', short_name: 'แชท', url: './?view=chat', description: 'เปิดหน้าคุยกับ No7' },
          { name: 'ความจำ', short_name: 'ความจำ', url: './?view=memory', description: 'ดู/แก้ความจำระยะยาว' },
          { name: 'ตารางนัด', short_name: 'นัด', url: './?view=calendar', description: 'ดูลำนัดหมาย' },
          { name: 'อุปกรณ์', short_name: 'อุปกรณ์', url: './?view=devices', description: 'สั่งงาน PC/ESP32' },
        ],
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
});
