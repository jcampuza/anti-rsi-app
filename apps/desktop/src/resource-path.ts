import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const getResourcePathCandidates = (
  fileName: string,
  options?: {
    moduleDir?: string;
    resourcesPath?: string;
  },
): string[] => {
  const moduleDir = options?.moduleDir ?? __dirname;
  const resourcesPath = options?.resourcesPath ?? process.resourcesPath;

  return [
    join(moduleDir, '../resources', fileName),
    join(resourcesPath, 'resources', fileName),
    join(resourcesPath, fileName),
  ];
};

export const resolveFirstExistingPath = (
  candidates: ReadonlyArray<string>,
  exists: (candidate: string) => boolean = existsSync,
): string | null => {
  for (const candidate of candidates) {
    if (exists(candidate)) {
      return candidate;
    }
  }

  return null;
};

export const resolveResourcePath = (fileName: string): string | null => {
  return resolveFirstExistingPath(getResourcePathCandidates(fileName));
};
