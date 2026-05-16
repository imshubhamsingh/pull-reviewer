import { http } from '@/lib/api/base'
import type { AppSettings } from '@/lib/api/types'

export const settings = {
  get: () => http.get<AppSettings>(`/api/settings`),

  /** Partial update — server merges and returns the full AppSettings shape. */
  update: (patch: Partial<AppSettings>) => http.patch<AppSettings>(`/api/settings`, patch),
}
