/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const demoModule = (name: string) => fileURLToPath(new URL(`./src/demo/${name}.ts`, import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Relative asset paths + hash routing means the build works under any
  // GitHub Pages sub-path (https://<user>.github.io/<repo>/) without configuration.
  base: './',
  resolve: {
    // `--mode demo` swaps the only modules that talk to Supabase for in-browser
    // fakes with the same exports, so the demo runs the real UI unchanged and
    // production builds contain no demo code.
    alias:
      mode === 'demo'
        ? [
            { find: /^.*\/lib\/api\.ts$/, replacement: demoModule('api') },
            { find: /^.*\/lib\/auth\.ts$/, replacement: demoModule('auth') },
            { find: /^.*\/lib\/supabase\.ts$/, replacement: demoModule('supabase') },
          ]
        : [],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 30_000,
  },
}));
