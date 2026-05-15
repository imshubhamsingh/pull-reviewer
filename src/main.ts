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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Any `target="_blank"` link or `window.open(url)` from the renderer routes
  // to the system default browser instead of spawning a child Electron window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    await window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    )
  }
}

function isExternalUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

app.whenReady().then(async () => {
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
}).catch((err: Error) => {
  log.error('Startup failed', { err: err.message })
  app.exit(1)
})

app.on('window-all-closed', () => {
  apiServer?.stop()
  services?.db.close()
  if (process.platform !== 'darwin') app.quit()
})
