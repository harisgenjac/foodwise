/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import packageJson from './package.json' with { type: 'json' }

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // The footer shows the app version; it is baked in at build time, not fetched.
  define: { __APP_VERSION__: JSON.stringify(packageJson.version) },
  // Tests read the server sources (src/i18n/serverMessages.test.ts); the dev server stays limited to client/.
  ...(mode === 'test' && { server: { fs: { allow: ['..'] } } }),
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
}))
