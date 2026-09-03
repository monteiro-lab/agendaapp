import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { apiDev } from './vite-dev-api'

export default defineConfig({
  // O .env fica na raiz do repositório (é o mesmo que o docker-compose lê),
  // e a raiz do Vite é app/ — sem isso as VITE_* não seriam carregadas.
  envDir: '..',
  plugins: [
    react(),
    // Serve as rotas de api/ no dev; em produção quem executa é a Vercel.
    apiDev(),
    VitePWA({
      // O service worker é nosso (src/sw/sw.ts): na Tarefa 9 ele passa a tratar
      // o evento `push`. O plugin só injeta a lista de precache.
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: null, // registramos manualmente em src/main.tsx
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
      manifest: {
        name: 'Agenda de Atendimentos',
        short_name: 'Agenda',
        description: 'Agenda semanal com lembretes. Os dados ficam só no aparelho.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7f7fb',
        theme_color: '#2f2a6b',
        icons: [
          { src: '/icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icone-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icone-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
