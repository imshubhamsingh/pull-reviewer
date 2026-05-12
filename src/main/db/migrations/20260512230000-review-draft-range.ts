import type { Db } from '@/main/db/db'
import up from '@/main/db/migrations/sqls/20260512230000-review-draft-range-up.sql?raw'

export const id = '20260512230000-review-draft-range'

export function applyUp(db: Db): void {
  db.exec(up)
}
