import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@/lib/ipc/channels'

contextBridge.exposeInMainWorld('electron', {
  getApiPort: (): Promise<number> => ipcRenderer.invoke(IPC.GetApiPort),
  /** Open a URL in the user's default browser (NOT in a new Electron window). */
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.OpenExternal, url),
})
