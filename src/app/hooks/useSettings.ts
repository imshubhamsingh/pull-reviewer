import { useCallback, useEffect, useState } from 'react'
import { api, type AppSettings } from '@/lib/api'

export interface SettingsState {
  settings: AppSettings
  loading: boolean
  error: string | undefined
  update: (patch: Partial<AppSettings>) => Promise<void>
  refresh: () => Promise<void>
}

const DEFAULTS: AppSettings = {
  chatHistoryBudget: null,
}

let cached: AppSettings | undefined
const subscribers = new Set<(s: AppSettings) => void>()

function publish(next: AppSettings): void {
  cached = next
  for (const fn of subscribers) fn(next)
}

/**
 * App-wide settings hook. The fetched payload is shared across all consumers
 * via a module-scoped cache + pub/sub so changing a knob in one place updates
 * everywhere without a network round-trip.
 */
export function useSettings(): SettingsState {
  const [settings, setSettings] = useState<AppSettings>(cached ?? DEFAULTS)
  const [loading, setLoading] = useState(cached == null)
  const [error, setError] = useState<string | undefined>()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const fetched = await api.settings.get()
      publish(fetched)
      setError(undefined)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const sub = (next: AppSettings): void => setSettings(next)
    subscribers.add(sub)
    if (cached == null) void refresh()
    return () => { subscribers.delete(sub) }
  }, [refresh])

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await api.settings.update(patch)
    publish(next)
  }, [])

  return { settings, loading, error, update, refresh }
}
