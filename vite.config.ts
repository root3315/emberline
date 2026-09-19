/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: { target: 'es2022', assetsInlineLimit: 0 },
  server: {
    port: 5178,
    open: true,
    // The archive builder writes thousands of cached responses under data/.
    // Without this the dev server reloads the page on every one of them.
    watch: { ignored: ['**/data/cache/**', '**/data/*.log'] },
  },
  test: {
    // The worker-thread pool crashes on this Windows setup; forks are stable.
    pool: 'forks',
  },
})
