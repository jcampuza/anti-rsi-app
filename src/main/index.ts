import { app, shell, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { AntiRsiConfig, AntiRsiEvent, AntiRsiSnapshot, BreakType } from '../common/antirsi-core'
import ConfigStore from './lib/config-store'
import AntiRsiService from './lib/antirsi-service'

let mainWindow: BrowserWindow | null = null
let antiRsiService: AntiRsiService | null = null
let overlayWindows: BrowserWindow[] = []
let tray: Tray | null = null

app.setName('Anti RSI')

const loadRenderer = (window: BrowserWindow, options?: { overlay?: boolean }): void => {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = options?.overlay
      ? `${process.env['ELECTRON_RENDERER_URL']}#overlay=1`
      : process.env['ELECTRON_RENDERER_URL']
    window.loadURL(url)
  } else {
    const hash = options?.overlay ? 'overlay=1' : undefined
    window.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    icon,
    ...(process.platform === 'linux' ? { icon } : {}),
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

  loadRenderer(mainWindow)
}

const broadcastAntiRsiEvent = (event: AntiRsiEvent, snapshot: AntiRsiSnapshot): void => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send('antirsi:event', event, snapshot)
  })
}

const ensureOverlayWindows = (breakType: BreakType): void => {
  const displays = screen.getAllDisplays()
  if (overlayWindows.length === displays.length) {
    overlayWindows.forEach((window) => {
      loadRenderer(window, { overlay: true })
      window.webContents.send('antirsi:overlay-break', breakType)
      window.showInactive()
    })
    return
  }

  hideOverlayWindows()

  overlayWindows = displays.map((display) => {
    const overlayWindow = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      show: false,
      frame: false,
      transparent: false,
      resizable: false,
      movable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: true,
      alwaysOnTop: true,
      backgroundColor: '#0d0d15',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    loadRenderer(overlayWindow, { overlay: true })
    overlayWindow.on('close', (event) => {
      if (overlayWindows.includes(overlayWindow)) {
        event.preventDefault()
        overlayWindow.hide()
      }
    })
    overlayWindow.once('ready-to-show', () => {
      overlayWindow.showInactive()
      overlayWindow.focus()
      overlayWindow.webContents.send('antirsi:overlay-break', breakType)
    })
    return overlayWindow
  })
}

const hideOverlayWindows = (): void => {
  if (overlayWindows.length === 0) {
    return
  }
  overlayWindows.forEach((window) => {
    window.removeAllListeners('close')
    window.close()
  })
  overlayWindows = []
}

const resolveResourcePath = (assetName: string): string => {
  const resourcesRoot = app.isPackaged ? process.resourcesPath : join(process.cwd(), 'resources')
  return join(resourcesRoot, assetName)
}

const showOrCreateMainWindow = (): void => {
  if (!mainWindow) {
    createWindow()
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

const ensureTray = (): void => {
  if (tray || process.platform !== 'darwin') {
    return
  }

  const trayIcon = nativeImage.createFromPath(resolveResourcePath('icon-menubarTemplate.png'))
  if (!trayIcon.isEmpty()) {
    trayIcon.setTemplateImage(true)
  }

  tray = new Tray(trayIcon)
  tray.setToolTip('Anti RSI')
  tray.on('click', () => {
    showOrCreateMainWindow()
  })

  const trayMenu = Menu.buildFromTemplate([
    {
      label: 'Show Anti RSI',
      click: () => {
        showOrCreateMainWindow()
      }
    },
    { type: 'separator' },
    {
      label: 'Pause Monitoring',
      click: () => {
        antiRsiService?.pause()
      }
    },
    {
      label: 'Resume Monitoring',
      click: () => {
        antiRsiService?.resume()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Anti RSI',
      role: 'quit'
    }
  ])

  tray.setContextMenu(trayMenu)
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.antirsi.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const configStore = new ConfigStore(app.getPath('userData'))
  const persistedConfig = await configStore.load()
  antiRsiService = new AntiRsiService({
    callbacks: {
      onEvent: (event, snapshot) => {
        broadcastAntiRsiEvent(event, snapshot)
        if (event.type === 'mini-break-start') {
          ensureOverlayWindows('mini')
        } else if (event.type === 'work-break-start') {
          ensureOverlayWindows('work')
        } else if (event.type === 'break-end') {
          hideOverlayWindows()
        }
      },
      onConfigChanged: (config) => {
        BrowserWindow.getAllWindows().forEach((window) => {
          window.webContents.send('antirsi:config', config)
        })
      }
    },
    configStore,
    initialConfig: persistedConfig
  })

  antiRsiService.start()
  ensureTray()

  ipcMain.handle('antirsi:get-snapshot', () => antiRsiService?.getSnapshot())
  ipcMain.handle('antirsi:get-config', () => antiRsiService?.getConfig())
  ipcMain.handle('antirsi:set-config', async (_event, config: Partial<AntiRsiConfig>) => {
    if (!antiRsiService) {
      return
    }

    await antiRsiService.setConfig(config)
    return antiRsiService.getConfig()
  })
  ipcMain.handle('antirsi:trigger-work-break', () => antiRsiService?.triggerWorkBreak())
  ipcMain.handle('antirsi:postpone-work-break', () => antiRsiService?.postponeWorkBreak())
  ipcMain.handle('antirsi:pause', () => antiRsiService?.pause())
  ipcMain.handle('antirsi:resume', () => antiRsiService?.resume())
  ipcMain.handle('antirsi:reset-timings', () => antiRsiService?.resetTimings())

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    antiRsiService?.stop()
    antiRsiService = null
    app.quit()
  }
})

app.on('before-quit', () => {
  tray?.destroy()
  tray = null
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
