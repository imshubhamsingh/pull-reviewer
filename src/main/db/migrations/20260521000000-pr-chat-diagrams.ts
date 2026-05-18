import type { Db } from '@/main/db/db'
import up from '@/main/db/migrations/sqls/20260521000000-pr-chat-diagrams-up.sql?raw'

export const id = '20260521000000-pr-chat-diagrams'

export function applyUp(db: Db): void {
  db.exec(up)
}
