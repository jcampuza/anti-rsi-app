import { BrowserWindow, app } from "electron"
import { join } from "path"
import { is } from "@electron-toolkit/utils"
import { type AntiRsiEvent, type AntiRsiSnapshot } from "../../common/antirsi-core"
import { IPC_EVENTS, MainEvent } from "../../common/actions"

export const loadRenderer = (
  window: BrowserWindow,
  options?: { overlay?: boolean; route?: string },
): void => {
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    const url = options?.route
      ? `${process.env["ELECTRON_RENDERER_URL"]}#${options.route}`
      : process.env["ELECTRON_RENDERER_URL"]
    window.loadURL(url)
  } else {
    const hash = options?.route
    window.loadFile(join(__dirname, "../renderer/index.html"), hash ? { hash } : undefined)
  }
}

export const resolveResourcePath = (assetName: string): string => {
  const resourcesRoot = app.isPackaged ? process.resourcesPath : join(process.cwd(), "resources")
  return join(resourcesRoot, assetName)
}

export const getPreloadPath = (): string => {
  return join(__dirname, "../preload/index.js")
}

export const broadcastAntiRsiEvent = (event: AntiRsiEvent, snapshot: AntiRsiSnapshot): void => {
  const payload: MainEvent = { type: "antirsi", event, snapshot }
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(IPC_EVENTS.EVENT, payload)
  })
}
