import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import { Service } from '@/main/service'
import { Db } from '@/main/db/db'
import { applyMigrations } from '@/main/db/migrations'

/**
 * Owns the SQLite connection lifecycle (open, pragmas, migrations, close).
 * Stores depend on the `query` facade, not this service directly, so they
 * never see the raw handle.
 */
export class DatabaseService extends Service {
  private readonly handle: Database.Database
  readonly query: Db

  constructor() {
    super()
    const dbPath = path.join(app.getPath('userData'), 'pull-reviewer.db')
    this.logger.info('Opening database', { dbPath })
    this.handle = new Database(dbPath)
    this.handle.pragma('journal_mode = WAL')
    this.handle.pragma('foreign_keys = ON')
    this.query = new Db(this.handle)
    applyMigrations(this.query, this.logger)
  }

  close(): void {
    this.handle.close()
  }
}
