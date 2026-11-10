/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths + hash routing means the build works under any
  // GitHub Pages sub-path (https://<user>.github.io/<repo>/) without configuration.
  base: './',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
