import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveElectronPath } from './electron-launcher';

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(__dirname, '..');
const electronBinaryPath = resolveElectronPath();
const childEnv = { ...process.env };

delete childEnv.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinaryPath, ['dist-electron/main.js'], {
  stdio: 'inherit',
  cwd: desktopDir,
  env: childEnv,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
