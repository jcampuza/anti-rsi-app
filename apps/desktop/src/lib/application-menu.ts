import { app, shell, Menu } from 'electron';
import { Context, Effect } from 'effect';

import { buildApplicationMenuTemplate } from './application-menu-template';

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
    const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

    const menu = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const template = buildApplicationMenuTemplate({
          appName: app.name,
          isDevelopment,
          onShowOrCreateMainWindow: callbacks.showOrCreateMainWindow,
          onOpenHelp: () => shell.openExternal('https://github.com/ruuda/antiRSI'),
        });

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
