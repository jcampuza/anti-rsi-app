import { BrowserWindow, screen } from 'electron';
import { Effect } from 'effect';
import { type BreakType } from '../../common/antirsi-core';
import { IPC_EVENTS } from '../../common/actions';
import { loadRenderer, getPreloadPath } from './window-utils';
import { AntiRsiEngine } from './antirsi-service';

export class OverlayManager extends Effect.Service<OverlayManager>()('OverlayManager', {
  scoped: Effect.gen(function* () {
    const antiRsiService = yield* AntiRsiEngine;

    let overlayWindows: BrowserWindow[] = [];
    const breakTypeMap = new Map<BrowserWindow, BreakType>();

    const hideOverlayWindows = (): void => {
      if (overlayWindows.length === 0) {
        return;
      }

      overlayWindows.forEach((window) => {
        window.removeAllListeners('close');
        breakTypeMap.delete(window);
        window.close();
      });

      overlayWindows = [];
    };

    yield* Effect.addFinalizer(() => Effect.sync(() => hideOverlayWindows()));

    const ensureOverlayWindows = (breakType: BreakType): void => {
      const displays = screen.getAllDisplays();

      if (overlayWindows.length === displays.length) {
        overlayWindows.forEach((window) => {
          const route = breakType === 'mini' ? '/micro-break' : '/work-break';
          loadRenderer(window, { overlay: true, route });
          window.webContents.send(IPC_EVENTS.OVERLAY_BREAK, breakType);
          breakTypeMap.set(window, breakType);
          window.showInactive();
        });
        return;
      }

      hideOverlayWindows();

      overlayWindows = displays.map((display) => {
        const overlayWindow = new BrowserWindow({
          x: display.bounds.x,
          y: display.bounds.y,
          width: display.bounds.width,
          height: display.bounds.height,
          show: false,
          frame: false,
          transparent: true,
          resizable: false,
          movable: false,
          fullscreenable: false,
          skipTaskbar: true,
          focusable: true,
          alwaysOnTop: true,
          webPreferences: {
            preload: getPreloadPath(),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        });

        overlayWindow.setAlwaysOnTop(true, 'screen-saver');
        overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

        const route = breakType === 'mini' ? '/micro-break' : '/work-break';
        loadRenderer(overlayWindow, { overlay: true, route });

        breakTypeMap.set(overlayWindow, breakType);

        overlayWindow.on('close', () => {
          if (overlayWindows.includes(overlayWindow)) {
            const windowBreakType = breakTypeMap.get(overlayWindow);
            if (windowBreakType) {
              // Check if we're actually in a break state before skipping
              const snapshot = antiRsiService.getSnapshot();
              const isInBreak =
                windowBreakType === 'mini'
                  ? snapshot.state === 'in-mini'
                  : snapshot.state === 'in-work';

              if (isInBreak) {
                if (windowBreakType === 'mini') {
                  antiRsiService.skipMicroBreak();
                } else {
                  antiRsiService.skipWorkBreak();
                }
              }
            }
            breakTypeMap.delete(overlayWindow);
          }
        });

        overlayWindow.once('ready-to-show', () => {
          overlayWindow.showInactive();
          overlayWindow.focus();
          overlayWindow.webContents.send(IPC_EVENTS.OVERLAY_BREAK, breakType);
        });

        return overlayWindow;
      });
    };

    return {
      ensureOverlayWindows,
      hideOverlayWindows,
    } as const;
  }),
}) {}
