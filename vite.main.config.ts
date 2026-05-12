import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      // Keep native + dynamic-loading deps out of the bundle so Node resolves
      // them from node_modules at runtime.
      external: ['better-sqlite3', 'pino', 'thread-stream'],
    },
  },
})
