// Vitest configuration (Phase 57a, SPEC-040). Deliberately standalone — it does
// NOT extend vite.config.js: the unit tests target pure logic in src/data and
// src/utils and need no React plugin, JSX transform, or browser environment.
// Storage-backed tests swap in the appStorage memory backend via
// src/test/storage.js instead of mocking localStorage.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
