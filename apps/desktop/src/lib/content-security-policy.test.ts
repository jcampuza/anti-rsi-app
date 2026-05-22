import { describe, expect, it } from 'vitest';

import { buildContentSecurityPolicy } from './content-security-policy';

describe('buildContentSecurityPolicy', () => {
  it('includes the runtime API origin and loopback port wildcards in connect-src', () => {
    const policy = buildContentSecurityPolicy('http://127.0.0.1:58353/');

    expect(policy).toContain("connect-src 'self' http://127.0.0.1:58353");
    expect(policy).toContain('http://127.0.0.1:*');
    expect(policy).toContain('http://localhost:*');
    expect(policy).toContain('ws://localhost:*');
  });
});
