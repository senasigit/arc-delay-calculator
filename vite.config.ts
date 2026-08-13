import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Hanya berkas yang benar-benar ada di public/ — entri fiktif membuat
      // precache manifest gagal diam-diam.
      includeAssets: ['favicon.ico', 'favicon.svg', 'logo.png'],
      workbox: {
        // Cegah file cadangan besar ikut ter-precache ke perangkat.
        globIgnores: ['**/*.bak'],
      },
      manifest: {
        name: 'Sub Forge — Subwoofer Array Calculator',
        short_name: 'Sub Forge',
        description: 'Kalkulator array & delay subwoofer: arc delay, cardioid, end-fire, dan peta SPL.',
        lang: 'id',
        theme_color: '#0e0f11',
        background_color: '#0e0f11',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
