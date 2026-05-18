import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { IPC } from '@/lib/ipc/channels'
import { logger } from '@/lib/logger'
import { buildServices, type Services } from '@/main/build-services'
import { startApiServer, type RunningServer } from '@/main/server'

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined
declare const MAIN_WINDOW_VITE_NAME: string

const log = logger.child({ name: 'Main' })

let apiServer: RunningServer | undefined
let services: Services | undefined

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Pull Reviewer',
    // Linux + Windows pick up the window/taskbar icon from here. macOS uses
    // the bundle icon in packaged builds and `app.dock.setIcon` in dev (set
    // once on `whenReady` below).
    icon: path.join(app.getAppPath(), 'assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Notification click handler in TourNotificationsService needs to focus +
  // send IPC to this window. Register on create, so macOS's activate flow
  // (window re-created after all-windows-closed) picks up the new instance.
  services?.setMainWindow(window)

  // Any `target="_blank"` link or `window.open(url)` from the renderer routes
  // to the system default browser instead of spawning a child Electron window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Plain `<a href="https://...">` clicks (no `target="_blank"`) would otherwise
  // navigate the renderer page itself. Intercept and route to the system browser
  // so the app never reloads into a third-party URL.
  window.webContents.on('will-navigate', (event, url) => {
    if (isExternalNavigation(url, window.webContents.getURL())) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    await window.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }
}

function isExternalUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

/**
 * Treat any http(s) URL whose origin differs from the renderer's current
 * origin as external. Keeps Vite HMR / localhost reloads and same-page anchor
 * jumps in-app, while routing real outbound links to the system browser.
 */
function isExternalNavigation(target: string, currentUrl: string): boolean {
  try {
    const t = new URL(target)
    if (t.protocol !== 'http:' && t.protocol !== 'https:') return false
    const c = new URL(currentUrl)
    return t.origin !== c.origin
  } catch {
    return false
  }
}

app
  .whenReady()
  .then(async () => {
    // Override the running Electron binary's dock icon in dev mode. In packaged
    // builds the bundle's .icns wins, so this call is a no-op there.
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(path.join(app.getAppPath(), 'assets/icon.png'))
    }

    services = buildServices()
    apiServer = await startApiServer(services)

    ipcMain.handle(IPC.GetApiPort, () => apiServer?.port ?? 0)
    ipcMain.handle(IPC.OpenExternal, async (_event, url: unknown) => {
      if (typeof url === 'string' && isExternalUrl(url)) await shell.openExternal(url)
    })

    // Best-effort cleanup of worktrees left behind by crashed prior runs.
    services.clones.sweepOrphans().catch((err: Error) => {
      log.warn('Worktree sweep failed', { err: err.message })
    })

    await createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
  .catch((err: Error) => {
    log.error('Startup failed', { err: err.message })
    app.exit(1)
  })

app.on('window-all-closed', () => {
  apiServer?.stop()
  services?.db.close()
  if (process.platform !== 'darwin') app.quit()
})
