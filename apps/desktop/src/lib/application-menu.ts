import { app, shell, Menu } from 'electron';

import { buildApplicationMenuTemplate } from './application-menu-template';

export type ApplicationMenuCallbacks = {
  showOrCreateMainWindow: () => void;
};

export class ApplicationMenu {
  private menu: Menu | null = null;

  constructor(private readonly callbacks: ApplicationMenuCallbacks) {
    const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
    const template = buildApplicationMenuTemplate({
      appName: app.name,
      isDevelopment,
      onShowOrCreateMainWindow: callbacks.showOrCreateMainWindow,
      onOpenHelp: () => shell.openExternal('https://github.com/ruuda/antiRSI'),
    });

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    this.menu = menu;
  }

  dispose(): void {
    Menu.setApplicationMenu(null);
    this.menu = null;
  }
}
