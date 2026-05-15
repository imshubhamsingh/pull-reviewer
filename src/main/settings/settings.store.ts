import type { Db } from '@/main/db/db'
import { Service } from '@/main/service'

interface Row {
  key: string
  value: string
  updated_at: string
}

export interface SettingEntry<T = unknown> {
  key: string
  value: T
  updatedAt: string
}

/**
 * Key-value persistence for app settings.
 *
 * - `value` is JSON-encoded so the store handles any serialisable shape
 *   (string | number | boolean | null | object | array) without per-key columns.
 * - `updated_at` records when the value last changed; the Settings UI uses it
 *   for "last edited" hints and for debugging stale values.
 * - `get<T>(key, fallback)` is type-safe at the call site; a missing or
 *   malformed row returns the fallback rather than throwing.
 *
 * Display labels and descriptions live in the UI catalog, not the DB.
 */
export class SettingsStore extends Service {
  constructor(private readonly db: Db) {
    super()
  }

  get<T>(key: string, fallback: T): T {
    const row = this.db.selectOne<Row>(
      /* sql */ `SELECT key, value, updated_at FROM settings WHERE key = ?`,
      [key],
    )
    if (!row) return fallback
    try {
      return JSON.parse(row.value) as T
    } catch {
      this.logger.warn('Malformed setting value, returning fallback', { key })
      return fallback
    }
  }

  set<T>(key: string, value: T): void {
    const now = new Date().toISOString()
    this.db.insert(
      /* sql */ `
        INSERT INTO settings (key, value, updated_at)
        VALUES (@key, @value, @now)
        ON CONFLICT(key) DO UPDATE SET
          value      = excluded.value,
          updated_at = excluded.updated_at
      `,
      { key, value: JSON.stringify(value), now },
    )
  }

  /** Returns every row with the value parsed. Used by GET /api/settings. */
  list(): SettingEntry[] {
    const rows = this.db.select<Row>(
      /* sql */ `SELECT key, value, updated_at FROM settings ORDER BY key`,
    )
    const out: SettingEntry[] = []
    for (const row of rows) {
      try {
        out.push({ key: row.key, value: JSON.parse(row.value), updatedAt: row.updated_at })
      } catch {
        this.logger.warn('Skipping malformed setting', { key: row.key })
      }
    }
    return out
  }
}
