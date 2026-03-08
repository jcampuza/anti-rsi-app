import { describe, expect, it, vi } from 'vitest';

import { buildApplicationMenuTemplate } from './application-menu-template';

describe('buildApplicationMenuTemplate', () => {
  it('starts with the app menu on macOS', () => {
    const template = buildApplicationMenuTemplate({
      appName: 'Anti RSI',
      isDevelopment: false,
      onShowOrCreateMainWindow: vi.fn(),
      onOpenHelp: vi.fn(async () => undefined),
    });

    expect(template[0]?.label).toBe('Anti RSI');
    expect(template[1]?.label).toBe('File');
    expect(template[2]?.role).toBe('editMenu');
    expect(template[4]?.role).toBe('windowMenu');
  });

  it('adds development-only view actions in development', () => {
    const template = buildApplicationMenuTemplate({
      appName: 'Anti RSI (Dev)',
      isDevelopment: true,
      onShowOrCreateMainWindow: vi.fn(),
      onOpenHelp: vi.fn(async () => undefined),
    });

    const viewMenu = template.find((item) => item.label === 'View');
    const submenu = Array.isArray(viewMenu?.submenu) ? viewMenu.submenu : [];
    const roles = submenu
      .map((item) => (typeof item === 'object' && item ? item.role : undefined))
      .filter(Boolean) as string[];

    expect(roles).toContain('reload');
    expect(roles).toContain('forceReload');
    expect(roles).toContain('toggleDevTools');
    expect(roles).toContain('togglefullscreen');
  });
});
