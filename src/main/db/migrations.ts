import type { Logger } from '@/lib/logger'
import type { Db } from '@/main/db/db'
import * as m20260512123142Initial from '@/main/db/migrations/20260512123142-initial'

interface Migration {
  id: string
  applyUp: (db: Db) => void
}

/**
 * Registered migrations. Filenames already carry timestamps so this list stays
 * naturally chronological — we sort by `id` defensively on every run regardless.
 */
const MIGRATIONS: Migration[] = [m20260512123142Initial]

export function applyMigrations(db: Db, logger: Logger): void {
  db.exec(/* sql */ `
    CREATE TABLE IF NOT EXISTS migrations (
      id         TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  const appliedRows = db.select<{ id: string }>(/* sql */ `SELECT id FROM migrations`)
  const applied = new Set(appliedRows.map((r) => r.id))

  const pending = [...MIGRATIONS]
    .sort((a, b) => a.id.localeCompare(b.id))
    .filter((m) => !applied.has(m.id))

  if (pending.length === 0) return

  for (const m of pending) {
    logger.info('Applying migration', { id: m.id })
    db.transaction(() => {
      m.applyUp(db)
      db.insert(/* sql */ `INSERT INTO migrations (id, applied_at) VALUES (?, ?)`, [m.id, new Date().toISOString()])
    })
  }
}
