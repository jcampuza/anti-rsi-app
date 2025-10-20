import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { IPC_EVENTS } from '../common/actions'
import { ConfigStore } from './lib/config-store'
import { AntiRsiService } from './lib/antirsi-service'
import { wireIpcHandlers } from './ipc'
import { ProcessService } from './lib/process-service'
import { broadcastAntiRsiEvent, loadRenderer } from './lib/window-utils'
import { ensureApplicationMenu } from './lib/application-menu'
import { TrayManager } from './lib/tray-manager'
import { OverlayManager } from './lib/overlay-manager'
import { Effect } from 'effect'
import { AppOrchestrator } from './lib/app-orchestrator'
import { createStore } from '../common/store/store'

let mainWindow: BrowserWindow | null = null

app.setName('Anti RSI')

// Initialize services
const configStore = new ConfigStore(app.getPath('userData'))
const processService = new ProcessService()
const trayManager = new TrayManager()
const overlayManager = new OverlayManager()

// Initialize shared store and AntiRsiService
const store = createStore()

const antiRsiService = new AntiRsiService({
  callbacks: {
    onEvent: (event, snapshot) => {
      broadcastAntiRsiEvent(event, snapshot)
    },
    onConfigChanged: (config) => {
      const payload = { type: 'config-changed', config } as const
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send(IPC_EVENTS.EVENT, payload)
      })
    }
  },
  configStore,
  store
})

const orchestrator: AppOrchestrator = new AppOrchestrator(
  antiRsiService,
  processService,
  overlayManager
)

function createMainWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    maxWidth: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.setTitle('Anti RSI')
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  loadRenderer(mainWindow)
}

const showOrCreateMainWindow = (): void => {
  if (!mainWindow) {
    createMainWindow()
    return
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }
  mainWindow.focus()
}

app.whenReady().then(async () => {
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Load persisted config into store
  const persistedConfig = await configStore.load()
  if (persistedConfig) {
    store.dispatch({ type: 'SET_CONFIG', config: persistedConfig })
  }

  processService.start()

  antiRsiService.start()

  trayManager.ensureTray({
    showOrCreateMainWindow,
    pauseMonitoring: () => antiRsiService.pause(),
    resumeMonitoring: () => antiRsiService.resume()
  })

  ensureApplicationMenu({
    showOrCreateMainWindow
  })

  Effect.runSync(wireIpcHandlers(store))
  createMainWindow()

  orchestrator.start()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // noop since this is a macos app and the normal behavior is to keep the app running
})

app.on('before-quit', () => {
  trayManager.destroy()
  antiRsiService.stop()
  processService.stop()
  orchestrator.stop()
})
