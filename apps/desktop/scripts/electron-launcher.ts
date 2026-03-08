import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { APP_BUNDLE_ID, getAppDisplayName } from '../src/lib/app-identity';

const LAUNCHER_VERSION = 1;

const __dirname = dirname(fileURLToPath(import.meta.url));
export const desktopDir = resolve(__dirname, '..');

const getAppDisplayNameForCurrentEnv = (): string => {
  return getAppDisplayName(Boolean(process.env.VITE_DEV_SERVER_URL));
};

function setPlistString(plistPath: string, key: string, value: string): void {
  const replaceResult = spawnSync('plutil', ['-replace', key, '-string', value, plistPath], {
    encoding: 'utf8',
  });
  if (replaceResult.status === 0) {
    return;
  }

  const insertResult = spawnSync('plutil', ['-insert', key, '-string', value, plistPath], {
    encoding: 'utf8',
  });
  if (insertResult.status === 0) {
    return;
  }

  const details = [replaceResult.stderr, insertResult.stderr].filter(Boolean).join('\n');
  throw new Error(`Failed to update plist key "${key}" at ${plistPath}: ${details}`.trim());
}

function patchMainBundleInfoPlist(appBundlePath: string, iconPath: string): void {
  const displayName = getAppDisplayNameForCurrentEnv();
  const infoPlistPath = join(appBundlePath, 'Contents', 'Info.plist');

  setPlistString(infoPlistPath, 'CFBundleDisplayName', displayName);
  setPlistString(infoPlistPath, 'CFBundleName', displayName);
  setPlistString(infoPlistPath, 'CFBundleIdentifier', APP_BUNDLE_ID);
  setPlistString(infoPlistPath, 'CFBundleIconFile', 'icon.icns');

  const resourcesDir = join(appBundlePath, 'Contents', 'Resources');
  copyFileSync(iconPath, join(resourcesDir, 'icon.icns'));
  copyFileSync(iconPath, join(resourcesDir, 'electron.icns'));
}

function patchHelperBundleInfoPlists(appBundlePath: string): void {
  const displayName = getAppDisplayNameForCurrentEnv();
  const frameworksDir = join(appBundlePath, 'Contents', 'Frameworks');
  if (!existsSync(frameworksDir)) {
    return;
  }

  for (const entry of readdirSync(frameworksDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.endsWith('.app')) {
      continue;
    }
    if (!entry.name.startsWith('Electron Helper')) {
      continue;
    }

    const helperPlistPath = join(frameworksDir, entry.name, 'Contents', 'Info.plist');
    if (!existsSync(helperPlistPath)) {
      continue;
    }

    const suffix = entry.name.replace('Electron Helper', '').replace('.app', '').trim();
    const helperName = suffix ? `${displayName} Helper ${suffix}` : `${displayName} Helper`;
    const helperIdSuffix = suffix.replace(/[()]/g, '').trim().toLowerCase().replace(/\s+/g, '-');
    const helperBundleId = helperIdSuffix
      ? `${APP_BUNDLE_ID}.helper.${helperIdSuffix}`
      : `${APP_BUNDLE_ID}.helper`;

    setPlistString(helperPlistPath, 'CFBundleDisplayName', helperName);
    setPlistString(helperPlistPath, 'CFBundleName', helperName);
    setPlistString(helperPlistPath, 'CFBundleIdentifier', helperBundleId);
  }
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function buildMacLauncher(electronBinaryPath: string): string {
  const displayName = getAppDisplayNameForCurrentEnv();
  const sourceAppBundlePath = resolve(electronBinaryPath, '../../..');
  const runtimeDir = join(desktopDir, '.electron-runtime');
  const targetAppBundlePath = join(runtimeDir, `${displayName}.app`);
  const targetBinaryPath = join(targetAppBundlePath, 'Contents', 'MacOS', 'Electron');
  const iconPath = join(desktopDir, 'resources', 'icon.icns');
  const metadataPath = join(runtimeDir, 'metadata.json');

  mkdirSync(runtimeDir, { recursive: true });

  const expectedMetadata = {
    launcherVersion: LAUNCHER_VERSION,
    displayName,
    sourceAppBundlePath,
    sourceAppMtimeMs: statSync(sourceAppBundlePath).mtimeMs,
    iconMtimeMs: statSync(iconPath).mtimeMs,
  };

  const currentMetadata = readJson(metadataPath);
  if (
    existsSync(targetBinaryPath) &&
    currentMetadata &&
    JSON.stringify(currentMetadata) === JSON.stringify(expectedMetadata)
  ) {
    return targetBinaryPath;
  }

  rmSync(targetAppBundlePath, { recursive: true, force: true });
  cpSync(sourceAppBundlePath, targetAppBundlePath, { recursive: true });
  patchMainBundleInfoPlist(targetAppBundlePath, iconPath);
  patchHelperBundleInfoPlists(targetAppBundlePath);
  writeFileSync(metadataPath, `${JSON.stringify(expectedMetadata, null, 2)}\n`);

  return targetBinaryPath;
}

export function resolveElectronPath(): string {
  if (process.platform !== 'darwin') {
    throw new Error('Anti RSI desktop only supports macOS.');
  }

  const require = createRequire(import.meta.url);
  const electronBinaryPath = require('electron') as string;

  return buildMacLauncher(electronBinaryPath);
}
