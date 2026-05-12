import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@/lib/ipc/channels'

contextBridge.exposeInMainWorld('electron', {
  getApiPort: (): Promise<number> => ipcRenderer.invoke(IPC.GetApiPort),
})
