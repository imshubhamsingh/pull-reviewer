import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    rollupOptions: {
      // Keep native + dynamic-loading deps out of the bundle so Node resolves
      // them from node_modules at runtime.
      external: ['better-sqlite3', 'pino', 'thread-stream'],
    },
  },
})
