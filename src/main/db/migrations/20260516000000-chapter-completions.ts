import type { Db } from '@/main/db/db'
import up from '@/main/db/migrations/sqls/20260516000000-chapter-completions-up.sql?raw'

export const id = '20260516000000-chapter-completions'

export function applyUp(db: Db): void {
  db.exec(up)
}
