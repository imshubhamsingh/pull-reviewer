import type { Db } from '@/main/db/db'
import up from '@/main/db/migrations/sqls/20260512220000-review-drafts-up.sql?raw'

export const id = '20260512220000-review-drafts'

export function applyUp(db: Db): void {
  db.exec(up)
}
