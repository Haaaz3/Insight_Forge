import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      // VSAC FHIR API proxy - routes /vsac-api/... to cts.nlm.nih.gov
      // Note: This only works in dev mode. For production (Vercel), a serverless
      // function would be needed at /api/vsac-proxy or similar.
      '/vsac-api': {
        target: 'https://cts.nlm.nih.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/vsac-api/, ''),
        secure: true,
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          pdfjs: ['pdfjs-dist'],
        },
      },
    },
  },
})
