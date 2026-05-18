import type { Logger } from '@/lib/logger'
import type { Db } from '@/main/db/db'
import * as m20260512123142Initial from '@/main/db/migrations/20260512123142-initial'
import * as m20260512191137ChaptersAndDiagrams from '@/main/db/migrations/20260512191137-chapters-and-diagrams'
import * as m20260512200401TourCostTracking from '@/main/db/migrations/20260512200401-tour-cost-tracking'
import * as m20260512220000ReviewDrafts from '@/main/db/migrations/20260512220000-review-drafts'
import * as m20260512230000ReviewDraftRange from '@/main/db/migrations/20260512230000-review-draft-range'
import * as m20260513000000QaThreads from '@/main/db/migrations/20260513000000-qa-threads'
import * as m20260514000000PrChats from '@/main/db/migrations/20260514000000-pr-chats'
import * as m20260514000001Settings from '@/main/db/migrations/20260514000001-settings'
import * as m20260515000000PrRecents from '@/main/db/migrations/20260515000000-pr-recents'
import * as m20260516000000ChapterCompletions from '@/main/db/migrations/20260516000000-chapter-completions'
import * as m20260516000001FileReviews from '@/main/db/migrations/20260516000001-file-reviews'
import * as m20260517000000AiReview from '@/main/db/migrations/20260517000000-ai-review'
import * as m20260518000000TourJobs from '@/main/db/migrations/20260518000000-tour-jobs'
import * as m20260519000000QaThreadChapter from '@/main/db/migrations/20260519000000-qa-thread-chapter'
import * as m20260520000000ReviewDraftSubmitError from '@/main/db/migrations/20260520000000-review-draft-submit-error'
import * as m20260521000000PrChatDiagrams from '@/main/db/migrations/20260521000000-pr-chat-diagrams'
import * as m20260522000000PrChatSession from '@/main/db/migrations/20260522000000-pr-chat-session'

interface Migration {
  id: string
  applyUp: (db: Db) => void
}

/**
 * Registered migrations. Filenames already carry timestamps so this list stays
 * naturally chronological — we sort by `id` defensively on every run regardless.
 */
const MIGRATIONS: Migration[] = [
  m20260512123142Initial,
  m20260512191137ChaptersAndDiagrams,
  m20260512200401TourCostTracking,
  m20260512220000ReviewDrafts,
  m20260512230000ReviewDraftRange,
  m20260513000000QaThreads,
  m20260514000000PrChats,
  m20260514000001Settings,
  m20260515000000PrRecents,
  m20260516000000ChapterCompletions,
  m20260516000001FileReviews,
  m20260517000000AiReview,
  m20260518000000TourJobs,
  m20260519000000QaThreadChapter,
  m20260520000000ReviewDraftSubmitError,
  m20260521000000PrChatDiagrams,
  m20260522000000PrChatSession,
]

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
      db.insert(/* sql */ `INSERT INTO migrations (id, applied_at) VALUES (?, ?)`, [
        m.id,
        new Date().toISOString(),
      ])
    })
  }
}
