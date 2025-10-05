import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { IPC_EVENTS } from '../common/actions'
import ConfigStore from './lib/config-store'
import AntiRsiService from './lib/antirsi-service'
import { wireIpcHandlers } from './ipc'
import { ProcessWatcherService } from './lib/process-watcher-service'
import ProcessStore from './lib/process-store'
import { broadcastAntiRsiEvent, loadRenderer } from './lib/window-utils'
import { ensureApplicationMenu } from './lib/application-menu'
import { TrayManager } from './lib/tray-manager'
import { OverlayManager } from './lib/overlay-manager'

let mainWindow: BrowserWindow | null = null

app.setName('Anti RSI')

// Initialize services
const configStore = new ConfigStore(app.getPath('userData'))
const processStore = new ProcessStore()
const trayManager = new TrayManager()
const overlayManager = new OverlayManager(is.dev)
const processWatcherService = new ProcessWatcherService()

// Initialize AntiRsiService (will be configured in app.whenReady)
const antiRsiService = new AntiRsiService({
  callbacks: {
    onEvent: (event, snapshot) => {
      broadcastAntiRsiEvent(event, snapshot)

      if (event.type === 'mini-break-start') {
        overlayManager.ensureOverlayWindows('mini')
      } else if (event.type === 'work-break-start') {
        overlayManager.ensureOverlayWindows('work')
      } else if (event.type === 'break-end') {
        overlayManager.hideOverlayWindows()
      }
    },
    onConfigChanged: (config) => {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send(IPC_EVENTS.CONFIG, config)
      })
    }
  },
  configStore,
  initialConfig: undefined
})

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
      sandbox: false
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

  // Load persisted config and configure AntiRsiService
  const persistedConfig = await configStore.load()
  antiRsiService.setConfig(persistedConfig || {})

  processWatcherService.start({
    store: processStore,
    onTick: (processes) => {
      if (processes.size > 0) {
        antiRsiService.pause()
      } else {
        antiRsiService.resume()
      }
    }
  })

  antiRsiService.start()

  trayManager.ensureTray({
    showOrCreateMainWindow,
    pauseMonitoring: () => antiRsiService.pause(),
    resumeMonitoring: () => antiRsiService.resume()
  })

  ensureApplicationMenu({
    showOrCreateMainWindow
  })

  processStore.subscribe((list) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(IPC_EVENTS.PROCESSES_UPDATE, list)
    })
  })

  wireIpcHandlers(antiRsiService, processStore)
  createMainWindow()

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
})
