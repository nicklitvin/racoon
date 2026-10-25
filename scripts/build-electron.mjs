// Bundles the Electron main and preload scripts into dist-electron/.
// Bundling (rather than plain tsc) lets the preload run with sandbox: true,
// where relative require() calls are not available.
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** The commit being built (from CI, or the checkout), for telling whether a release is newer. */
function buildCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

export async function buildElectron({ dev = false } = {}) {
  await build({
    entryPoints: { main: 'electron/main.ts', preload: 'electron/preload.ts' },
    outdir: 'dist-electron',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron', 'uiohook-napi'],
    sourcemap: dev ? 'inline' : false,
    minify: !dev,
    logLevel: 'warning',
    define: {
      __BUILD_COMMIT__: JSON.stringify(buildCommit()),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildElectron();
}
