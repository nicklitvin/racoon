// Development runner: starts the Vite dev server (with hot reload for the renderer),
// bundles the Electron main/preload, then launches Electron pointed at the dev server.
// Changes to electron/ need a restart (Ctrl+C, then `npm run dev`).
import { spawn } from 'node:child_process';
import electronPath from 'electron';
import { createServer } from 'vite';
import { buildElectron } from './build-electron.mjs';

const server = await createServer();
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('Vite dev server did not report a URL');

await buildElectron({ dev: true });

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

const shutdown = async (code = 0) => {
  await server.close();
  process.exit(code);
};
child.on('exit', (code) => shutdown(code ?? 0));
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
