import { Menu, BrowserWindow, app } from 'electron'
import { basename } from 'path'

const isMac = process.platform === 'darwin'

export function buildMenu(win: BrowserWindow, recentFiles: string[]): void {
  const recentSubmenu =
    recentFiles.length > 0
      ? [
          ...recentFiles.map((f, i) => ({
            label: `${i + 1}. ${basename(f)}`,
            click: () => win.webContents.send('menu:action', 'openRecent', f)
          })),
          { type: 'separator' as const },
          {
            label: 'Clear Recent',
            click: () => win.webContents.send('menu:action', 'clearRecent')
          }
        ]
      : [{ label: 'No Recent Event Sets', enabled: false }]

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Event Set',
          accelerator: 'CmdOrCtrl+N',
          click: () => win.webContents.send('menu:action', 'new')
        },
        {
          label: 'Open Event Set…',
          accelerator: 'CmdOrCtrl+O',
          click: () => win.webContents.send('menu:action', 'open')
        },
        { type: 'separator' as const },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => win.webContents.send('menu:action', 'save')
        },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => win.webContents.send('menu:action', 'saveAs')
        },
        { type: 'separator' as const },
        { label: 'Open Recent', submenu: recentSubmenu },
        { type: 'separator' as const },
        {
          label: 'Import Sports Sounds Pro Set…',
          click: () => win.webContents.send('menu:action', 'importSsp')
        },
        {
          label: 'Import Bank…',
          click: () => win.webContents.send('menu:action', 'importBank')
        },
        ...(isMac
          ? []
          : [
              { type: 'separator' as const },
              {
                label: 'Exit',
                accelerator: 'Alt+F4',
                click: () => app.quit()
              }
            ])
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
