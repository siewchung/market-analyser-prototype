import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // ES-module workers let the worker file use normal `import` statements.
  worker: { format: 'es' },
  test: {
    // The domain code never touches the DOM, so plain Node is enough (and faster).
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
