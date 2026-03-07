import { app, type BrowserWindow } from 'electron';
import { Effect, Scope } from 'effect';

export class ElectronApp extends Effect.Service<ElectronApp>()('ElectronApp', {
  effect: Effect.sync(() => {
    const onScoped = (
      event: string,
      listener: (...args: ReadonlyArray<unknown>) => void,
    ): Effect.Effect<void, never, Scope.Scope> =>
      Effect.acquireRelease(
        Effect.sync(() => {
          // Electron's app is a Node EventEmitter, so we manage add/remove manually.
          app.on(event as never, listener as never);
        }),
        () =>
          Effect.sync(() => {
            app.removeListener(event as never, listener as never);
          }),
      ).pipe(Effect.asVoid);

    const awaitOnce = (event: string): Effect.Effect<void, never, Scope.Scope> =>
      Effect.async<void>((resume) => {
        const handler = () => resume(Effect.void);
        app.once(event as never, handler as never);
        return Effect.sync(() => {
          app.removeListener(event as never, handler as never);
        });
      });

    const onBrowserWindowCreated = (
      listener: (window: BrowserWindow) => void,
    ): Effect.Effect<void, never, Scope.Scope> =>
      onScoped('browser-window-created', (...args) => {
        const window = args[1] as BrowserWindow | undefined;
        if (window) {
          listener(window);
        }
      });

    return {
      whenReady: Effect.promise(() => app.whenReady()),
      onScoped,
      awaitOnce,
      onBrowserWindowCreated,
    } as const;
  }),
}) {}
