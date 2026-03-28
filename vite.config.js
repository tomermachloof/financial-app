import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/financial-app/',
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/index-[hash]-${Date.now()}.js`,
        chunkFileNames: `assets/chunk-[hash]-${Date.now()}.js`,
        assetFileNames: `assets/index-[hash]-${Date.now()}.[ext]`,
      }
    }
  }
})
