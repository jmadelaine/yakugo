import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const API_URL = process.env.API_URL ?? 'http://localhost:8787'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  },
  server: {
    proxy: {
      '/api': API_URL,
      '/auth': API_URL,
    },
  },
  test: {
    include: ['shared/**/*.test.ts', 'server/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
