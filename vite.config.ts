/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The lazily loaded ELK layout chunk is ~1.4 MB on its own.
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    // happy-dom, not jsdom: jsdom's separate typed-array realm breaks CID hashing in multiformats.
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
