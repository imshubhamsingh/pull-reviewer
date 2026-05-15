import type { Db } from '@/main/db/db'
import up from '@/main/db/migrations/sqls/20260516000001-file-reviews-up.sql?raw'

export const id = '20260516000001-file-reviews'

export function applyUp(db: Db): void {
  db.exec(up)
}
