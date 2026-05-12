import type { Db } from '@/main/db/db'
import up from '@/main/db/migrations/sqls/20260513000000-qa-threads-up.sql?raw'

export const id = '20260513000000-qa-threads'

export function applyUp(db: Db): void {
  db.exec(up)
}
