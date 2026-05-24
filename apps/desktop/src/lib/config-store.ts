import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { parseAntiRsiConfig, type AntiRsiConfig } from '@antirsi/core';
import { writeAppLog } from './app-logger';

const CONFIG_FILENAME = 'antirsi-config.json';

export class ConfigStore {
  private readonly configPath: string;

  constructor(userDataPath: string) {
    this.configPath = join(userDataPath, CONFIG_FILENAME);
  }

  async load(): Promise<AntiRsiConfig | null> {
    try {
      const raw = await readFile(this.configPath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      writeAppLog('main', 'Loading config from store');
      return parseAntiRsiConfig(parsed);
    } catch (error) {
      if (isEnoent(error)) {
        return null;
      }
      writeAppLog('main', 'Config load error', error);
      return null;
    }
  }

  async save(config: AntiRsiConfig): Promise<void> {
    const validated = parseAntiRsiConfig(config);
    const tempPath = `${this.configPath}.tmp`;
    try {
      await writeFile(tempPath, JSON.stringify(validated, null, 2), 'utf8');
      await rename(tempPath, this.configPath);
      writeAppLog('main', 'Saving config to store');
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      writeAppLog('main', 'Config save error', error);
    }
  }
}

const isEnoent = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code: string }).code === 'ENOENT';
