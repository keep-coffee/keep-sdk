import { defineConfig } from 'tsup';

// Dual ESM + CJS build with type declarations. Declared deps (@solana/web3.js,
// @solana/spl-token, @noble/hashes) are externalized by tsup automatically so a
// consumer's single web3.js instance is reused (no duplicate Connection types).
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
