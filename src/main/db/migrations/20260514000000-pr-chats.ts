import type { Db } from '@/main/db/db'
import up from '@/main/db/migrations/sqls/20260514000000-pr-chats-up.sql?raw'

export const id = '20260514000000-pr-chats'

export function applyUp(db: Db): void {
  db.exec(up)
}
