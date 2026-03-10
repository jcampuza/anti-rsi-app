import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { IPC_EVENTS } from '@antirsi/contracts';
import { createStore, selectConfig, StoreTag, type AntiRsiConfig } from '@antirsi/core';
import { ConfigStore } from './lib/config-store';
import { AntiRsiEngine } from './lib/antirsi-service';
import { wireIpcHandlers } from './ipc';
import { ProcessService } from './lib/process-service';
import { loadRenderer, resolveResourcePath } from './lib/window-utils';
import { ApplicationMenu, ApplicationMenuCallbacksTag } from './lib/application-menu';
import { TrayManager, TrayManagerCallbacksTag } from './lib/tray-manager';
import { OverlayManager } from './lib/overlay-manager';
import { Effect, Fiber, Layer, Logger, Option, Stream, PubSub } from 'effect';
import { AppOrchestrator } from './lib/app-orchestrator';
import { getAppDisplayName } from './lib/app-identity';
import * as KeyValueStore from '@effect/platform/KeyValueStore';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import * as NodeContext from '@effect/platform-node/NodeContext';
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import { ElectronApp } from './lib/electron-app';
import { getAppLogPath, writeAppLog } from './lib/app-logger';

let mainWindow: BrowserWindow | null = null;
const TRANSLUCENT_WINDOW_OPACITY = 0.94;
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const appDisplayName = getAppDisplayName(isDevelopment);
const RENDERER_LOG_CHANNEL = '__ANTIRSI_RENDERER_LOG__';

// Initialize shared store
const store = createStore();

// ConfigStore live layer with its dependencies
const ConfigStoreLive = ConfigStore.Default.pipe(
  Layer.provide(KeyValueStore.layerFileSystem(app.getPath('userData'))),
  Layer.provide(NodeFileSystem.layer),
  Layer.provide(NodePath.layer),
  Layer.provide(Logger.json),
);

// ProcessService live layer with its dependencies
const ProcessServiceLive = ProcessService.Default.pipe(Layer.provide(NodeContext.layer));

// Store layer
const StoreLive = Layer.succeed(StoreTag, store);

// AntiRsiEngine live layer with its dependencies
const AntiRsiEngineLive = AntiRsiEngine.Default.pipe(Layer.provide(StoreLive));

// Create the Effect layer stack for all services
const ServicesLive = Layer.mergeAll(
  ConfigStoreLive,
  ProcessServiceLive,
  AntiRsiEngineLive,
  ElectronApp.Default,
);

function createMainWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    maxWidth: 900,
    height: 670,
    show: false,
    title: appDisplayName,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  applyWindowAppearance(mainWindow, selectConfig(store.getState()));

  mainWindow.on('ready-to-show', () => {
    writeAppLog('main', 'Main window ready-to-show');
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
    mainWindow?.setTitle(appDisplayName);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    writeAppLog('main', 'Renderer finished load', {
      url: mainWindow?.webContents.getURL(),
      title: mainWindow?.getTitle(),
    });
    mainWindow?.setTitle(appDisplayName);
  });

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      writeAppLog('main', 'Renderer did-fail-load', {
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame,
      });
    },
  );

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeAppLog('main', 'Renderer process gone', details);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    writeAppLog('renderer', 'console-message', {
      level,
      message,
      line,
      sourceId,
    });
  });

  mainWindow.on('closed', () => {
    writeAppLog('main', 'Main window closed');
    mainWindow = null;
  });

  writeAppLog('main', 'Loading renderer', {
    devServerUrl: process.env['VITE_DEV_SERVER_URL'] ?? null,
  });
  loadRenderer(mainWindow);
}

const configureAppIdentity = (): void => {
  app.setName(appDisplayName);
  app.setAboutPanelOptions({
    applicationName: appDisplayName,
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
  });

  const dockIconPath = resolveResourcePath('icon.png');
  if (dockIconPath && app.dock) {
    app.dock.setIcon(dockIconPath);
  }
};

const configureAppLogging = (): void => {
  const mainLogPath = getAppLogPath('main');
  const rendererLogPath = getAppLogPath('renderer');

  writeAppLog('main', 'App logging configured', {
    mainLogPath,
    rendererLogPath,
    isDevelopment,
    userDataPath: app.getPath('userData'),
  });

  process.on('uncaughtException', (error) => {
    writeAppLog('main', 'uncaughtException', error);
  });

  process.on('unhandledRejection', (reason) => {
    writeAppLog('main', 'unhandledRejection', reason);
  });

  app.on('render-process-gone', (_event, _webContents, details) => {
    writeAppLog('main', 'App render-process-gone', details);
  });

  app.on('child-process-gone', (_event, details) => {
    writeAppLog('main', 'Child process gone', details);
  });
};

const getWindowOpacity = (config: AntiRsiConfig): number => {
  if (!config.appearance.translucentWindows) {
    return 1;
  }

  return TRANSLUCENT_WINDOW_OPACITY;
};

const applyWindowAppearance = (window: BrowserWindow, config: AntiRsiConfig): void => {
  if (process.platform === 'linux') {
    return;
  }

  window.setOpacity(getWindowOpacity(config));
};

const applyAllWindowAppearance = (config: AntiRsiConfig): void => {
  BrowserWindow.getAllWindows().forEach((window) => {
    applyWindowAppearance(window, config);
  });
};

const showOrCreateMainWindow = (): void => {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.focus();
};

const mainProgram = Effect.scoped(
  Effect.gen(function* () {
    // Initialize services from the layer graph
    const configStore = yield* ConfigStore;
    yield* ProcessService; // ensure process polling is running
    const antiRsiEngine = yield* AntiRsiEngine;

    // Load persisted config into store
    const persistedConfig = yield* configStore.load;
    if (Option.isSome(persistedConfig)) {
      store.dispatch({ type: 'SET_CONFIG', config: persistedConfig.value });
    }

    // Subscribe to config changes, broadcast to all windows, and persist to disk
    yield* Effect.forkScoped(
      Effect.scoped(
        Effect.gen(function* () {
          const subscription = yield* PubSub.subscribe(antiRsiEngine.configChanges);
          yield* Stream.fromQueue(subscription).pipe(
            Stream.runForEach(({ config }) =>
              Effect.gen(function* () {
                // Broadcast to windows
                BrowserWindow.getAllWindows().forEach((window) => {
                  window.webContents.send(IPC_EVENTS.EVENT, { type: 'config-changed', config });
                });
                applyAllWindowAppearance(config);
                // Persist to disk
                yield* configStore.save(config);
              }),
            ),
          );
        }),
      ),
    );

    const TrayLive = TrayManager.Default.pipe(
      Layer.provide(
        Layer.succeed(TrayManagerCallbacksTag, {
          showOrCreateMainWindow,
          pauseMonitoring: () => Effect.runFork(antiRsiEngine.pause()),
          resumeMonitoring: () => Effect.runFork(antiRsiEngine.resume()),
        }),
      ),
    );
    yield* Effect.forkScoped(Layer.launch(TrayLive));

    const ApplicationMenuLive = ApplicationMenu.Default.pipe(
      Layer.provide(
        Layer.succeed(ApplicationMenuCallbacksTag, {
          showOrCreateMainWindow,
        }),
      ),
    );
    yield* Effect.forkScoped(Layer.launch(ApplicationMenuLive));

    yield* wireIpcHandlers(store);

    yield* Effect.sync(() => {
      createMainWindow();
    });

    // Start the main-process orchestrator under the same scope.
    const OrchestratorLive = AppOrchestrator.Default.pipe(Layer.provide(OverlayManager.Default));

    yield* Effect.forkScoped(Layer.launch(OrchestratorLive));

    // Keep the scope alive for the lifetime of the app.
    return yield* Effect.never;
  }),
);

const rootProgram = Effect.scoped(
  Effect.gen(function* () {
    const electronApp = yield* ElectronApp;

    // Listener to keep macOS behavior (stay running when all windows are closed).
    yield* electronApp.onScoped('window-all-closed', () => {
      // noop since this is a macos app and the normal behavior is to keep the app running
    });

    // Start listening for quit early; completing this will end the program and release the scope.
    const quitFiber = yield* Effect.forkScoped(electronApp.awaitOnce('before-quit'));

    // Gate all initialization on Electron readiness.
    yield* electronApp.whenReady;
    yield* Effect.sync(() => {
      configureAppLogging();
      configureAppIdentity();
      ipcMain.on(RENDERER_LOG_CHANNEL, (_event, payload) => {
        writeAppLog('renderer', 'renderer-event', payload);
      });
    });

    // Global Electron listeners (managed by scope finalizers).
    yield* electronApp.onScoped('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });

    // Launch the main effect program with the shared layer graph under this same scope.
    yield* Effect.forkScoped(mainProgram);

    // Block until quit, then scope finalizers will interrupt everything.
    yield* Fiber.join(quitFiber);
  }),
);

NodeRuntime.runMain(Effect.provide(rootProgram, ServicesLive));
