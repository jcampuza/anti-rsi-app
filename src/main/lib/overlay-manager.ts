import { BrowserWindow, screen } from 'electron'
import { BreakType } from '../../common/antirsi-core'
import { IPC_EVENTS } from '../../common/actions'
import { loadRenderer, getPreloadPath } from './window-utils'

export class OverlayManager {
  private overlayWindows: BrowserWindow[] = []

  constructor(private isDevelopment: boolean) {}

  ensureOverlayWindows(breakType: BreakType): void {
    const displays = screen.getAllDisplays()
    if (this.overlayWindows.length === displays.length) {
      this.overlayWindows.forEach((window) => {
        const route = breakType === 'mini' ? '/micro-break' : '/work-break'
        loadRenderer(window, { overlay: true, route })
        window.webContents.send(IPC_EVENTS.OVERLAY_BREAK, breakType)
        window.showInactive()
      })
      return
    }

    this.hideOverlayWindows()

    this.overlayWindows = displays.map((display) => {
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
        alwaysOnTop: !this.isDevelopment,
        backgroundColor: '#0d0d15',
        webPreferences: {
          preload: getPreloadPath(),
          sandbox: false
        }
      })

      if (!this.isDevelopment) {
        overlayWindow.setAlwaysOnTop(true, 'screen-saver')
        overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      }

      const route = breakType === 'mini' ? '/micro-break' : '/work-break'
      loadRenderer(overlayWindow, { overlay: true, route })
      overlayWindow.on('close', (event) => {
        if (this.overlayWindows.includes(overlayWindow)) {
          event.preventDefault()
          overlayWindow.hide()
        }
      })
      overlayWindow.once('ready-to-show', () => {
        overlayWindow.showInactive()
        overlayWindow.focus()
        overlayWindow.webContents.send(IPC_EVENTS.OVERLAY_BREAK, breakType)
      })
      return overlayWindow
    })
  }

  hideOverlayWindows(): void {
    if (this.overlayWindows.length === 0) {
      return
    }
    this.overlayWindows.forEach((window) => {
      window.removeAllListeners('close')
      window.close()
    })
    this.overlayWindows = []
  }
}
