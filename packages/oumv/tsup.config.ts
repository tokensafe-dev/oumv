import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/protocol.ts',
    'src/schema.ts',
    'src/conformance.ts',
  ],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  noExternal: [
    '@oumv/conformance',
    '@oumv/protocol',
    '@oumv/schema',
  ],
});
