import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { createStore } from '@antirsi/core';
import { ConfigStore } from './lib/config-store';
import { AntiRsiEngine } from './lib/antirsi-service';
import { ProcessService } from './lib/process-service';
import { broadcastApiEvent, ensureApiServer, stopApiServer } from './lib/api-runtime';
import { configureRendererContentSecurityPolicy } from './lib/content-security-policy';
import { ensureRendererServer, stopRendererServer } from './lib/renderer-runtime';
import { loadRenderer, resolveResourcePath } from './lib/window-utils';
import { ApplicationMenu } from './lib/application-menu';
import { TrayManager } from './lib/tray-manager';
import { OverlayManager } from './lib/overlay-manager';
import { AppOrchestrator } from './lib/app-orchestrator';
import { getAppDisplayName } from './lib/app-identity';
import { onAppEvent, onceAppEvent, whenReady } from './lib/electron-app';
import { getAppLogPath, writeAppLog } from './lib/app-logger';

let mainWindow: BrowserWindow | null = null;
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const appDisplayName = getAppDisplayName(isDevelopment);
const RENDERER_LOG_CHANNEL = '__ANTIRSI_RENDERER_LOG__';

const store = createStore();

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    maxWidth: 900,
    height: 670,
    show: false,
    title: appDisplayName,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 8, y: 8 },
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

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
    rendererBaseUrl:
      process.env['ANTIRSI_RENDERER_URL'] ?? process.env['VITE_DEV_SERVER_URL'] ?? null,
    route: null,
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

async function bootstrap(): Promise<void> {
  const disposables: Array<{ dispose: () => void }> = [];
  const unsubscribers: Array<() => void> = [];

  const cleanup = (): void => {
    for (const unsubscribe of unsubscribers.reverse()) {
      unsubscribe();
    }
    unsubscribers.length = 0;
    for (const disposable of disposables.reverse()) {
      disposable.dispose();
    }
    disposables.length = 0;
  };

  onAppEvent('window-all-closed', () => {
    // macOS: keep running when all windows are closed
  });

  await whenReady();
  await ensureRendererServer(__dirname);
  const apiBaseUrl = await ensureApiServer(store);
  configureRendererContentSecurityPolicy(apiBaseUrl);

  configureAppLogging();
  configureAppIdentity();

  ipcMain.on(RENDERER_LOG_CHANNEL, (_event, payload) => {
    writeAppLog('renderer', 'renderer-event', payload);
  });

  const removeWillQuit = onAppEvent('will-quit', () => {
    void stopRendererServer();
    void stopApiServer();
  });
  unsubscribers.push(removeWillQuit);

  unsubscribers.push(
    onAppEvent('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    }),
  );

  const configStore = new ConfigStore(app.getPath('userData'));
  const antiRsiEngine = new AntiRsiEngine(store);
  const processService = new ProcessService();
  const overlayManager = new OverlayManager(antiRsiEngine);
  const orchestrator = new AppOrchestrator(antiRsiEngine, processService, overlayManager);

  disposables.push(antiRsiEngine, processService, overlayManager, orchestrator);

  const persistedConfig = await configStore.load();
  if (persistedConfig) {
    store.dispatch({ type: 'SET_CONFIG', config: persistedConfig });
  }

  unsubscribers.push(
    antiRsiEngine.onConfigChange(({ config }) => {
      broadcastApiEvent({ type: 'config-changed', config });
      void configStore.save(config);
    }),
  );

  const tray = new TrayManager({
    showOrCreateMainWindow,
    pauseMonitoring: () => antiRsiEngine.pause(),
    resumeMonitoring: () => antiRsiEngine.resume(),
  });
  disposables.push(tray);

  const applicationMenu = new ApplicationMenu({ showOrCreateMainWindow });
  disposables.push(applicationMenu);

  processService.start();
  orchestrator.start();
  antiRsiEngine.start();

  createMainWindow();

  await onceAppEvent('before-quit');
  cleanup();
}

void bootstrap().catch((error) => {
  writeAppLog('main', 'bootstrap failed', error);
});
