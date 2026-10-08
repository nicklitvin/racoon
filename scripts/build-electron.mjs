// Bundles the Electron main and preload scripts into dist-electron/.
// Bundling (rather than plain tsc) lets the preload run with sandbox: true,
// where relative require() calls are not available.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

export async function buildElectron({ dev = false } = {}) {
  await build({
    entryPoints: { main: 'electron/main.ts', preload: 'electron/preload.ts' },
    outdir: 'dist-electron',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    sourcemap: dev ? 'inline' : false,
    minify: !dev,
    logLevel: 'warning',
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildElectron();
}
