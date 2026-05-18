import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type OpenPrTourPayload } from '@/lib/ipc/channels'

contextBridge.exposeInMainWorld('electron', {
  getApiPort: (): Promise<number> => ipcRenderer.invoke(IPC.GetApiPort),
  /** Open a URL in the user's default browser (NOT in a new Electron window). */
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.OpenExternal, url),
  /**
   * Subscribe to "open this PR's tour" events from main (fired when the user
   * clicks the OS notification for a finished background tour job). Returns
   * an unsubscribe function.
   */
  onOpenPrTour: (handler: (payload: OpenPrTourPayload) => void): (() => void) => {
    const wrapped = (_e: IpcRendererEvent, payload: OpenPrTourPayload): void => handler(payload)
    ipcRenderer.on(IPC.OpenPrTour, wrapped)
    return () => ipcRenderer.removeListener(IPC.OpenPrTour, wrapped)
  },
})
