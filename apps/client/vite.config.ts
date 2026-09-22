import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      // La sim est consommee directement en TypeScript : pas d'etape de build
      // intermediaire, donc pas de risque que client et serveur divergent (§4).
      '@bougie/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['@bougie/shared'],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    // CrazyGames plafonne a 50 Mo de chargement initial (§4). On en est tres loin,
    // mais autant le voir des qu'on s'en approche.
    chunkSizeWarningLimit: 4096,
  },
})
