import { Tray, nativeImage, Menu } from 'electron'
import { resolveResourcePath } from './window-utils'

export type TrayManagerCallbacks = {
  showOrCreateMainWindow: () => void
  pauseMonitoring: () => void
  resumeMonitoring: () => void
}

export class TrayManager {
  private tray: Tray | null = null

  ensureTray(callbacks: TrayManagerCallbacks): void {
    if (this.tray) {
      return
    }

    const trayIcon = nativeImage.createFromPath(resolveResourcePath('icon-menubarTemplate.png'))
    if (!trayIcon.isEmpty()) {
      trayIcon.setTemplateImage(true)
    }

    this.tray = new Tray(trayIcon)
    this.tray.setToolTip('Anti RSI')
    this.tray.on('click', () => {
      callbacks.showOrCreateMainWindow()
    })

    const trayMenu = [
      {
        label: 'Show Anti RSI',
        click: () => {
          callbacks.showOrCreateMainWindow()
        }
      },
      { type: 'separator' as const },
      {
        label: 'Pause Monitoring',
        click: () => {
          callbacks.pauseMonitoring()
        }
      },
      {
        label: 'Resume Monitoring',
        click: () => {
          callbacks.resumeMonitoring()
        }
      },
      { type: 'separator' as const },
      {
        label: 'Quit Anti RSI',
        role: 'quit' as const
      }
    ]

    this.tray.setContextMenu(Menu.buildFromTemplate(trayMenu))
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
