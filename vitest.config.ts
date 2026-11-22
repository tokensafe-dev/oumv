import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      'oumv/protocol': path.resolve(__dirname, 'packages/oumv/src/protocol.ts'),
      'oumv/schema': path.resolve(__dirname, 'packages/oumv/src/schema.ts'),
      'oumv/conformance': path.resolve(__dirname, 'packages/oumv/src/conformance.ts'),
      'oumv': path.resolve(__dirname, 'packages/oumv/src/index.ts'),
      '@oumv/protocol': path.resolve(__dirname, 'packages/protocol/src/index.ts'),
      '@oumv/schema': path.resolve(__dirname, 'packages/schema/src/index.ts'),
      '@oumv/conformance': path.resolve(__dirname, 'packages/conformance/src/index.ts'),
    },
  },
  test: {
    globals: true,
  },
});
