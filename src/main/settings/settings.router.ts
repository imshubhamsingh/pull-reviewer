import { Hono } from 'hono'
import { z } from 'zod'
import { Service } from '@/main/service'
import type { SettingsStore } from '@/main/settings/settings.store'

/**
 * App settings exposed to the renderer. Keys are dotted identifiers that map
 * 1:1 to columns in the renderer's `AppSettings` interface.
 *
 *  - `chat.history.budget` — null = full history; integer ≥ 1 = last N pairs.
 *
 * The schema doubles as runtime validation for PATCH writes.
 */
const SETTINGS_SCHEMA = {
  'chat.history.budget': z.number().int().positive().nullable(),
} as const

type SettingsKey = keyof typeof SETTINGS_SCHEMA

const KEY_TO_CAMEL: Record<SettingsKey, string> = {
  'chat.history.budget': 'chatHistoryBudget',
}

const CAMEL_TO_KEY: Record<string, SettingsKey> = Object.fromEntries(
  Object.entries(KEY_TO_CAMEL).map(([k, v]) => [v, k as SettingsKey]),
) as Record<string, SettingsKey>

const DEFAULTS: Record<SettingsKey, unknown> = {
  'chat.history.budget': null,
}

export class SettingsRouter extends Service {
  constructor(private readonly store: SettingsStore) {
    super()
  }

  routes(): Hono {
    const app = new Hono()

    app.get('/', (c) => c.json(this.readAll()))

    app.patch('/', async (c) => {
      const body = await c.req.json<Record<string, unknown>>().catch(() => null)
      if (!body || typeof body !== 'object') {
        return c.json({ error: 'body must be an object of {camelCaseKey: value}' }, 400)
      }
      for (const [camel, value] of Object.entries(body)) {
        const key = CAMEL_TO_KEY[camel]
        if (!key) return c.json({ error: `unknown setting: ${camel}` }, 400)
        const parsed = SETTINGS_SCHEMA[key].safeParse(value)
        if (!parsed.success) return c.json({ error: `invalid value for ${camel}: ${parsed.error.message}` }, 400)
        this.store.set(key, parsed.data)
      }
      return c.json(this.readAll())
    })

    return app
  }

  private readAll(): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [key, camel] of Object.entries(KEY_TO_CAMEL) as [SettingsKey, string][]) {
      out[camel] = this.store.get(key, DEFAULTS[key])
    }
    return out
  }
}
