import { app, type BrowserWindow } from 'electron';

export const whenReady = (): Promise<void> => app.whenReady().then(() => undefined);

export const onAppEvent = (
  event: string,
  listener: (...args: ReadonlyArray<unknown>) => void,
): (() => void) => {
  app.on(event as never, listener as never);
  return () => {
    app.removeListener(event as never, listener as never);
  };
};

export const onceAppEvent = (event: string): Promise<void> =>
  new Promise((resolve) => {
    const handler = (): void => {
      app.removeListener(event as never, handler as never);
      resolve();
    };
    app.once(event as never, handler as never);
  });

export const onBrowserWindowCreated = (
  listener: (window: BrowserWindow) => void,
): (() => void) =>
  onAppEvent('browser-window-created', (...args) => {
    const window = args[1] as BrowserWindow | undefined;
    if (window) {
      listener(window);
    }
  });
