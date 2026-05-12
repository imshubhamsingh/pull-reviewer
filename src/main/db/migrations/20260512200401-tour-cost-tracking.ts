import type { Db } from '@/main/db/db'
import up from '@/main/db/migrations/sqls/20260512200401-tour-cost-tracking-up.sql?raw'

export const id = '20260512200401-tour-cost-tracking'

export function applyUp(db: Db): void {
  db.exec(up)
}
