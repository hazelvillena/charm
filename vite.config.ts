import { defineConfig } from 'vitest/config';

export default defineConfig({
  optimizeDeps: { exclude: ['manifold-3d'] },
  build: { target: 'es2022', rollupOptions: { input: { main: 'index.html', styleguide: 'design/styleguide.html' } } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
