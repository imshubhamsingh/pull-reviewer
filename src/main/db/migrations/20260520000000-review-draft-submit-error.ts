import type { Db } from '@/main/db/db'
import up from '@/main/db/migrations/sqls/20260520000000-review-draft-submit-error-up.sql?raw'

export const id = '20260520000000-review-draft-submit-error'

export function applyUp(db: Db): void {
  db.exec(up)
}
