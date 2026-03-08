import type { MenuItemConstructorOptions } from 'electron';

export type ApplicationMenuTemplateOptions = {
  appName: string;
  isDevelopment: boolean;
  onShowOrCreateMainWindow: () => void;
  onOpenHelp: () => Promise<void>;
};

export const buildApplicationMenuTemplate = ({
  appName,
  isDevelopment,
  onShowOrCreateMainWindow,
  onOpenHelp,
}: ApplicationMenuTemplateOptions): MenuItemConstructorOptions[] => {
  const viewSubmenu: MenuItemConstructorOptions[] = [];

  if (isDevelopment) {
    viewSubmenu.push(
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
    );
  }

  viewSubmenu.push({ role: 'togglefullscreen' });

  return [
    {
      label: appName,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'Command+N',
          click: () => {
            onShowOrCreateMainWindow();
          },
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: viewSubmenu,
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            await onOpenHelp();
          },
        },
      ],
    },
  ];
};
