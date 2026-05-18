import type { Db } from '@/main/db/db'
import up from '@/main/db/migrations/sqls/20260522000000-pr-chat-session-up.sql?raw'

export const id = '20260522000000-pr-chat-session'

export function applyUp(db: Db): void {
  db.exec(up)
}
