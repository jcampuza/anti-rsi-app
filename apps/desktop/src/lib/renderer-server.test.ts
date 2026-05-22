import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { normalizeStaticRequestPathname, resolveStaticFilePath } from './renderer-server';

describe('renderer-server static paths', () => {
  it('rejects path traversal', () => {
    expect(normalizeStaticRequestPathname('/../secret')).toBeNull();
  });

  it('falls back to index.html for SPA routes', () => {
    const root = mkdtempSync(join(tmpdir(), 'antirsi-static-'));
    const indexPath = join(root, 'index.html');
    writeFileSync(indexPath, '<html>ok</html>');
    mkdirSync(join(root, 'assets'), { recursive: true });
    writeFileSync(join(root, 'assets', 'app.js'), 'console.log("ok")');

    expect(resolveStaticFilePath(root, '/config')).toBe(indexPath);
    expect(resolveStaticFilePath(root, '/assets/app.js')).toBe(join(root, 'assets', 'app.js'));
  });
});
