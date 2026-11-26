import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    protocol: 'src/protocol.ts',
    schema: 'src/schema.ts',
    conformance: 'src/conformance.ts',
    // The certification CLIs live in @oumv/conformance but ship inside this
    // package: @oumv/* is an internal workspace scope with no npm scope of its own.
    'cli/certify': '../conformance/src/cli/certify.ts',
    'cli/lint-adapter': '../conformance/src/cli/lint-adapter.ts',
  },
  format: ['cjs', 'esm'],
  dts: { entry: ['src/index.ts', 'src/protocol.ts', 'src/schema.ts', 'src/conformance.ts'] },
  clean: true,
  sourcemap: true,
  noExternal: [
    '@oumv/conformance',
    '@oumv/protocol',
    '@oumv/schema',
  ],
});
