import { buildClient, type HttpClient } from '@/lib/api/client'

declare global {
  interface Window {
    electron: {
      getApiPort: () => Promise<number>
      openExternal: (url: string) => Promise<void>
    }
  }
}

let baseUrl: Promise<string> | undefined

/**
 * Embedded server's base URL, resolved once per session via the preload IPC.
 * 127.0.0.1 (not `localhost`) avoids the IPv4/IPv6 resolution mismatch that
 * surfaces when Hono binds to 127.0.0.1 but Chromium's fetch tries ::1.
 */
export function getBaseUrl(): Promise<string> {
  baseUrl ??= window.electron.getApiPort().then((port) => `http://127.0.0.1:${port}`)
  return baseUrl
}

export const http: HttpClient = buildClient(getBaseUrl)
export { ApiError } from '@/lib/api/client'
