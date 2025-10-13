import { app, shell, Menu, MenuItemConstructorOptions } from 'electron'
import { is } from '@electron-toolkit/utils'
import { Effect } from 'effect'

export type ApplicationMenuCallbacks = {
  showOrCreateMainWindow: () => void
}

export const ensureApplicationMenu = (callbacks: ApplicationMenuCallbacks) => {
  return Effect.sync(() => {
    const template: MenuItemConstructorOptions[] = [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'File',
        submenu: [
          {
            label: 'New Window',
            accelerator: 'Command+N',
            click: () => {
              callbacks.showOrCreateMainWindow()
            }
          },
          { type: 'separator' },
          { role: 'close' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: [
          ...(is.dev
            ? ([
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' }
              ] satisfies MenuItemConstructorOptions[])
            : []),
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
      },
      {
        role: 'help',
        submenu: [
          {
            label: 'Learn More',
            click: async () => {
              await shell.openExternal('https://github.com/ruuda/antiRSI')
            }
          }
        ]
      }
    ]

    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)

    return menu
  })
}
