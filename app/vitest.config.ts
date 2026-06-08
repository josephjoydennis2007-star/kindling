import path from 'path';
import { defineConfig } from 'vitest/config';

// Unit-test config — kept separate from vite.config.ts so the dev/build
// pipeline (and the kimi inspect plugin) isn't pulled into the test runner.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    css: false,
  },
});
