import { describe, expect, it } from 'vitest';

import { APP_DEV_NAME, APP_PRODUCT_NAME, getAppDisplayName } from './app-identity';

describe('getAppDisplayName', () => {
  it('returns the production name outside development', () => {
    expect(getAppDisplayName(false)).toBe(APP_PRODUCT_NAME);
  });

  it('returns the development name in development', () => {
    expect(getAppDisplayName(true)).toBe(APP_DEV_NAME);
  });
});
