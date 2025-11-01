import { BrowserWindow, screen } from "electron"
import { type BreakType } from "../../common/antirsi-core"
import { IPC_EVENTS } from "../../common/actions"
import { loadRenderer, getPreloadPath } from "./window-utils"

export class OverlayManager {
  private overlayWindows: BrowserWindow[] = []

  ensureOverlayWindows(breakType: BreakType): void {
    const displays = screen.getAllDisplays()
    if (this.overlayWindows.length === displays.length) {
      this.overlayWindows.forEach((window) => {
        const route = breakType === "mini" ? "/micro-break" : "/work-break"
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
      })

      overlayWindow.setAlwaysOnTop(true, "screen-saver")
      overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

      const route = breakType === "mini" ? "/micro-break" : "/work-break"
      loadRenderer(overlayWindow, { overlay: true, route })
      overlayWindow.on("close", (event) => {
        if (this.overlayWindows.includes(overlayWindow)) {
          event.preventDefault()
          overlayWindow.hide()
        }
      })
      overlayWindow.once("ready-to-show", () => {
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
      window.removeAllListeners("close")
      window.close()
    })
    this.overlayWindows = []
  }
}
