import { BrowserWindow, screen } from 'electron';
import { type BreakType } from '@antirsi/core';
import { IPC_EVENTS } from '@antirsi/contracts';
import { loadRenderer, getPreloadPath } from './window-utils';
import { type AntiRsiEngine } from './antirsi-service';

export class OverlayManager {
  private overlayWindows: BrowserWindow[] = [];
  private readonly breakTypeMap = new Map<BrowserWindow, BreakType>();

  constructor(private readonly antiRsiEngine: AntiRsiEngine) {}

  dispose(): void {
    this.hideOverlayWindows();
  }

  hideOverlayWindows(): void {
    if (this.overlayWindows.length === 0) {
      return;
    }

    this.overlayWindows.forEach((window) => {
      window.removeAllListeners('close');
      this.breakTypeMap.delete(window);
      window.close();
    });

    this.overlayWindows = [];
  }

  ensureOverlayWindows(breakType: BreakType): void {
    const displays = screen.getAllDisplays();

    if (this.overlayWindows.length === displays.length) {
      this.overlayWindows.forEach((window) => {
        const route = breakType === 'mini' ? '/micro-break' : '/work-break';
        loadRenderer(window, { overlay: true, route });
        window.webContents.send(IPC_EVENTS.OVERLAY_BREAK, breakType);
        this.breakTypeMap.set(window, breakType);
        window.showInactive();
      });
      return;
    }

    this.hideOverlayWindows();

    this.overlayWindows = displays.map((display) => {
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

      const route = breakType === 'mini' ? '/micro-break' : '/work-break';
      loadRenderer(overlayWindow, { overlay: true, route });

      this.breakTypeMap.set(overlayWindow, breakType);

      overlayWindow.on('close', () => {
        if (this.overlayWindows.includes(overlayWindow)) {
          const windowBreakType = this.breakTypeMap.get(overlayWindow);
          if (windowBreakType) {
            const snapshot = this.antiRsiEngine.getSnapshot();
            const isInBreak =
              windowBreakType === 'mini'
                ? snapshot.state === 'in-mini'
                : snapshot.state === 'in-work';

            if (isInBreak) {
              if (windowBreakType === 'mini') {
                this.antiRsiEngine.skipMicroBreak();
              } else {
                this.antiRsiEngine.skipWorkBreak();
              }
            }
          }
          this.breakTypeMap.delete(overlayWindow);
        }
      });

      overlayWindow.once('ready-to-show', () => {
        overlayWindow.showInactive();
        overlayWindow.focus();
        overlayWindow.webContents.send(IPC_EVENTS.OVERLAY_BREAK, breakType);
      });

      return overlayWindow;
    });
  }
}
