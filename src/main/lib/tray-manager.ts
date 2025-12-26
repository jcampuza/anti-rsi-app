import { Tray, nativeImage, Menu } from 'electron';
import { Context, Effect } from 'effect';
import { resolveResourcePath } from './window-utils';

export type TrayManagerCallbacks = {
  showOrCreateMainWindow: () => void;
  pauseMonitoring: () => void;
  resumeMonitoring: () => void;
};

export class TrayManagerCallbacksTag extends Context.Tag('TrayManagerCallbacks')<
  TrayManagerCallbacksTag,
  TrayManagerCallbacks
>() {}

export class TrayManager extends Effect.Service<TrayManager>()('TrayManager', {
  scoped: Effect.gen(function* () {
    const callbacks = yield* TrayManagerCallbacksTag;

    const tray = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const trayIcon = nativeImage.createFromPath(
          resolveResourcePath('icon-menubarTemplate.png'),
        );
        if (!trayIcon.isEmpty()) {
          trayIcon.setTemplateImage(true);
        }

        const tray = new Tray(trayIcon);
        tray.setToolTip('Anti RSI');
        tray.on('click', () => {
          callbacks.showOrCreateMainWindow();
        });

        const trayMenu = [
          {
            label: 'Show Anti RSI',
            click: () => {
              callbacks.showOrCreateMainWindow();
            },
          },
          { type: 'separator' as const },
          {
            label: 'Pause Monitoring',
            click: () => {
              callbacks.pauseMonitoring();
            },
          },
          {
            label: 'Resume Monitoring',
            click: () => {
              callbacks.resumeMonitoring();
            },
          },
          { type: 'separator' as const },
          {
            label: 'Quit Anti RSI',
            role: 'quit' as const,
          },
        ];

        tray.setContextMenu(Menu.buildFromTemplate(trayMenu));

        return tray;
      }),
      (tray) =>
        Effect.sync(() => {
          tray.destroy();
        }),
    );

    return {
      tray,
    } as const;
  }),
}) {}
