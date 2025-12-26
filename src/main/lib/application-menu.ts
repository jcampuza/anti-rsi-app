import { app, shell, Menu, MenuItemConstructorOptions } from 'electron';
import { is } from '@electron-toolkit/utils';
import { Context, Effect } from 'effect';

export type ApplicationMenuCallbacks = {
  showOrCreateMainWindow: () => void;
};

export class ApplicationMenuCallbacksTag extends Context.Tag('ApplicationMenuCallbacks')<
  ApplicationMenuCallbacksTag,
  ApplicationMenuCallbacks
>() {}

export class ApplicationMenu extends Effect.Service<ApplicationMenu>()('ApplicationMenu', {
  scoped: Effect.gen(function* () {
    const callbacks = yield* ApplicationMenuCallbacksTag;

    const menu = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const template: MenuItemConstructorOptions[] = [
          {
            label: app.name,
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
                  callbacks.showOrCreateMainWindow();
                },
              },
              { type: 'separator' },
              { role: 'close' },
            ],
          },
          {
            label: 'Edit',
            submenu: [
              { role: 'undo' },
              { role: 'redo' },
              { type: 'separator' },
              { role: 'cut' },
              { role: 'copy' },
              { role: 'paste' },
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
            ],
          },
          {
            label: 'View',
            submenu: [
              ...(is.dev
                ? ([
                    { role: 'reload' },
                    { role: 'forceReload' },
                    { role: 'toggleDevTools' },
                  ] satisfies MenuItemConstructorOptions[])
                : []),
              { type: 'separator' },
              { role: 'togglefullscreen' },
            ],
          },
          {
            label: 'Window',
            submenu: [
              { role: 'minimize' },
              { role: 'zoom' },
              { type: 'separator' },
              { role: 'front' },
            ],
          },
          {
            role: 'help',
            submenu: [
              {
                label: 'Learn More',
                click: async () => {
                  await shell.openExternal('https://github.com/ruuda/antiRSI');
                },
              },
            ],
          },
        ];

        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
        return menu;
      }),
      () =>
        Effect.sync(() => {
          Menu.setApplicationMenu(null);
        }),
    );

    return {
      menu,
    } as const;
  }),
}) {}
