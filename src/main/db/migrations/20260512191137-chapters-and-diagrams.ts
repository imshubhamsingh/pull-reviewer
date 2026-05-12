import type { Db } from '@/main/db/db'
import up from '@/main/db/migrations/sqls/20260512191137-chapters-and-diagrams-up.sql?raw'

export const id = '20260512191137-chapters-and-diagrams'

export function applyUp(db: Db): void {
  db.exec(up)
}
