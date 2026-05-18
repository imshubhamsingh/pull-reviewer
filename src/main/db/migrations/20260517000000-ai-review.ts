import type { Db } from '@/main/db/db'
import up from '@/main/db/migrations/sqls/20260517000000-ai-review-up.sql?raw'

export const id = '20260517000000-ai-review'

export function applyUp(db: Db): void {
  db.exec(up)
}
