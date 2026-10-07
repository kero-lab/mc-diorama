// Same split as RemHub: plain .ts in node, .tsx (DOM) in jsdom.
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true, mockReset: true, setupFiles: ['tests/setup.ts'],
    projects: [
      { extends: true, test: { name: 'node', environment: 'node', include: ['tests/**/*.test.ts'] } },
      { extends: true, test: { name: 'dom', environment: 'jsdom', include: ['tests/**/*.test.tsx'] } },
    ],
  },
});
