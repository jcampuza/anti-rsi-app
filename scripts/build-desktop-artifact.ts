import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

type Platform = 'mac';
type Arch = 'arm64' | 'x64';

type BuildOptions = {
  platform: Platform;
  target: string;
  arch: Arch;
  outputDir: string;
  skipBuild: boolean;
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktopDir = join(repoRoot, 'apps/desktop');
const webDir = join(repoRoot, 'apps/web');
const desktopDistDir = join(desktopDir, 'dist-electron');
const webDistDir = join(webDir, 'dist');
const desktopResourcesDir = join(desktopDir, 'resources');

const parseArgs = (): BuildOptions => {
  const args = new Map<string, string | boolean>();
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (!value) {
      continue;
    }
    if (!value.startsWith('--')) continue;
    const [key, inlineValue] = value.slice(2).split('=', 2);
    if (!key) {
      continue;
    }
    if (inlineValue !== undefined) {
      args.set(key, inlineValue);
      continue;
    }
    const next = process.argv[index + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, true);
      continue;
    }
    args.set(key, next);
    index += 1;
  }

  const platform = (args.get('platform') as Platform | undefined) ?? defaultPlatform();
  const target = (args.get('target') as string | undefined) ?? defaultTarget();
  const arch = (args.get('arch') as Arch | undefined) ?? defaultArch();
  const outputDir = resolve(repoRoot, String(args.get('output-dir') ?? 'artifacts/desktop'));
  const skipBuild = Boolean(args.get('skip-build'));

  return { platform, target, arch, outputDir, skipBuild };
};

const defaultPlatform = (): Platform => {
  if (process.platform !== 'darwin') {
    throw new Error('AntiRSI desktop artifacts are only supported on macOS');
  }
  return 'mac';
};

const defaultTarget = (): string => 'dmg';

const defaultArch = (): Arch => {
  return process.arch === 'arm64' ? 'arm64' : 'x64';
};

function platformFlag(): string {
  return '--mac';
}

const run = (command: string[], cwd: string, env?: NodeJS.ProcessEnv): void => {
  const [file, ...args] = command;
  if (!file) {
    throw new Error('Missing command executable');
  }
  const result = spawnSync(file, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const assertPath = (path: string, label: string): void => {
  if (!existsSync(path)) {
    throw new Error(`Missing ${label} at ${path}`);
  }
};

const readJson = <T>(path: string): T => {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
};

const options = parseArgs();

if (options.platform !== 'mac') {
  throw new Error('Only macOS desktop packaging is supported');
}

if (!options.skipBuild) {
  run(['bun', 'run', 'build:desktop'], repoRoot);
}

assertPath(desktopDistDir, 'desktop bundle');
assertPath(webDistDir, 'web bundle');
assertPath(desktopResourcesDir, 'desktop resources');

const stageRoot = mkdtempSync(join(tmpdir(), 'antirsi-desktop-stage-'));
const stageAppDir = join(stageRoot, 'app');
const stageDistDir = join(stageAppDir, 'dist');

mkdirSync(join(stageAppDir, 'apps/desktop'), { recursive: true });
mkdirSync(join(stageAppDir, 'apps/web'), { recursive: true });

cpSync(desktopDistDir, join(stageAppDir, 'apps/desktop/dist-electron'), { recursive: true });
cpSync(webDistDir, join(stageAppDir, 'apps/web/dist'), { recursive: true });
cpSync(desktopResourcesDir, join(stageAppDir, 'apps/desktop/resources'), { recursive: true });

type DesktopPackageJson = {
  readonly dependencies: Record<string, string>;
  readonly productName?: string;
};

const desktopPackageJson = readJson<DesktopPackageJson>(join(desktopDir, 'package.json'));
const electronVersion = desktopPackageJson.dependencies.electron;
const runtimeDependencies = Object.fromEntries(
  Object.entries(desktopPackageJson.dependencies).filter(
    ([name, version]) => name !== 'electron' && !version.startsWith('workspace:'),
  ),
);

const stagePackageJson = {
  name: 'antirsi-desktop',
  version: '1.0.0',
  private: true,
  description: 'Anti RSI desktop build',
  author: 'Joseph Campuzano',
  main: 'apps/desktop/dist-electron/main.js',
  build: {
    appId: 'com.antirsi.app',
    productName: desktopPackageJson.productName ?? 'Anti RSI',
    artifactName: 'antirsi-${version}-${arch}.${ext}',
    directories: {
      buildResources: 'apps/desktop/resources',
    },
    mac: {
      target: options.target === 'dmg' ? ['dmg', 'zip'] : [options.target],
      icon: 'icon.icns',
      category: 'public.app-category.productivity',
      entitlementsInherit: 'apps/desktop/resources/entitlements.mac.plist',
      notarize: false,
    },
    publish: [
      {
        provider: 'generic',
        url: 'https://example.com/auto-updates',
      },
    ],
  },
  dependencies: {
    ...runtimeDependencies,
  },
  devDependencies: {
    electron: electronVersion,
  },
};

writeFileSync(join(stageAppDir, 'package.json'), `${JSON.stringify(stagePackageJson, null, 2)}\n`);

run(['bun', 'install'], stageAppDir);
run(
  ['bunx', 'electron-builder@latest', platformFlag(), `--${options.arch}`, '--publish', 'never'],
  stageAppDir,
);

mkdirSync(options.outputDir, { recursive: true });

for (const entry of readdirSync(stageDistDir)) {
  const source = join(stageDistDir, entry);
  if (!statSync(source).isFile()) continue;
  cpSync(source, join(options.outputDir, entry));
}

rmSync(stageRoot, { recursive: true, force: true });
