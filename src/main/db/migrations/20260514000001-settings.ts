import type { Db } from '@/main/db/db'
import up from '@/main/db/migrations/sqls/20260514000001-settings-up.sql?raw'

export const id = '20260514000001-settings'

export function applyUp(db: Db): void {
  db.exec(up)
}
