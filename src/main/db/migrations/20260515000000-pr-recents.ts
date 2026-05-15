import type { Db } from '@/main/db/db'
import up from '@/main/db/migrations/sqls/20260515000000-pr-recents-up.sql?raw'

export const id = '20260515000000-pr-recents'

export function applyUp(db: Db): void {
  db.exec(up)
}
