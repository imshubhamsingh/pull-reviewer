import type { Db } from '@/main/db/db'
import up from '@/main/db/migrations/sqls/20260519000000-qa-thread-chapter-up.sql?raw'

export const id = '20260519000000-qa-thread-chapter'

export function applyUp(db: Db): void {
  db.exec(up)
}
