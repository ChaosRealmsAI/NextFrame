// esbuild single-file bundle for nf-core-engine.
// Two outputs:
//   dist/engine.js     — CLI entry (src/cli.ts), node18 ESM.
//   dist/engine-lib.js — library exports (src/index.ts) for tests + embedders.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const common = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: false,
  minify: false,
  banner: {
    // ESM shim so bundled CJS deps can call require/__filename/__dirname.
    js: "import { createRequire as __nf_cr } from 'node:module'; const require = __nf_cr(import.meta.url);"
  },
  logLevel: 'info'
};

await build({
  ...common,
  entryPoints: [resolve(__dirname, 'src/cli.ts')],
  outfile: resolve(__dirname, 'dist/engine.js')
});

await build({
  ...common,
  entryPoints: [resolve(__dirname, 'src/index.ts')],
  outfile: resolve(__dirname, 'dist/engine-lib.js')
});
