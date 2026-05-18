import type { Db } from '@/main/db/db'
import up from '@/main/db/migrations/sqls/20260518000000-tour-jobs-up.sql?raw'

export const id = '20260518000000-tour-jobs'

export function applyUp(db: Db): void {
  db.exec(up)
}
