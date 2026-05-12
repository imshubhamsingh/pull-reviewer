import type { Db } from '@/main/db/db'
import up from '@/main/db/migrations/sqls/20260512123142-initial-up.sql?raw'

export const id = '20260512123142-initial'

export function applyUp(db: Db): void {
  db.exec(up)
}
