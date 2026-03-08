import { describe, expect, it } from 'vitest';

import { getResourcePathCandidates, resolveFirstExistingPath } from './resource-path';

describe('getResourcePathCandidates', () => {
  it('prefers local resources before packaged resources', () => {
    expect(
      getResourcePathCandidates('icon.png', {
        moduleDir: '/Users/josephcampuzano/me/anti-rsi-app/apps/desktop/dist-electron',
        resourcesPath: '/Applications/Anti RSI.app/Contents/Resources',
      }),
    ).toEqual([
      '/Users/josephcampuzano/me/anti-rsi-app/apps/desktop/resources/icon.png',
      '/Applications/Anti RSI.app/Contents/Resources/resources/icon.png',
      '/Applications/Anti RSI.app/Contents/Resources/icon.png',
    ]);
  });
});

describe('resolveFirstExistingPath', () => {
  it('returns the first matching candidate', () => {
    const candidates = ['/missing/icon.png', '/resources/icon.png', '/fallback/icon.png'];

    expect(
      resolveFirstExistingPath(candidates, (candidate) => candidate === '/resources/icon.png'),
    ).toBe('/resources/icon.png');
  });

  it('returns null when nothing exists', () => {
    expect(resolveFirstExistingPath(['/missing/icon.png'], () => false)).toBeNull();
  });
});
