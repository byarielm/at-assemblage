/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Social crawlers need absolute og:image / og:url values. Resolve them at build time from
 * VITE_SITE_URL (or Vercel's production URL); with neither set the tags fall back to
 * root-relative paths, which is fine for local dev.
 */
function siteUrl(mode: string): Plugin {
  return {
    name: 'assemblage-site-url',
    transformIndexHtml(html) {
      const env = loadEnv(mode, process.cwd(), '')
      const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
      const raw = env.VITE_SITE_URL || (vercel ? `https://${vercel}` : '')
      const base = raw.replace(/\/+$/, '')
      return html.replaceAll('%SITE_URL%', base)
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), siteUrl(mode)],
  // The lazily loaded ELK layout chunk is ~1.4 MB on its own.
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    // happy-dom, not jsdom: jsdom's separate typed-array realm breaks CID hashing in multiformats.
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
}))
