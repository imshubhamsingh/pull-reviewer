import type Database from 'better-sqlite3'
import { Service } from '@/main/service'

type Params = unknown[] | Record<string, unknown>

/** Queries slower than this get a warn-level log line. Tune per profiling. */
const SLOW_QUERY_MS = 50

/**
 * Typed query facade over better-sqlite3.
 *
 * - `select<T>` / `selectOne<T>` / `insert` / `update` / `delete` are typed operations.
 * - `exec` is for DDL / multi-statement scripts that don't take params.
 * - `transaction<T>` wraps work in a synchronous transaction (better-sqlite3 is sync).
 *
 * Every call runs through `observed()` which adds timing, slow-query warnings,
 * and structured error logs. Future hooks (metrics, retry) live here too.
 */
export class Db extends Service {
  constructor(private readonly handle: Database.Database) {
    super()
  }

  /** Returns all matching rows. */
  select<T>(query: string, params?: Params): T[] {
    return this.observed('select', query, () => callAll(this.handle.prepare(query), params) as T[])
  }

  /** Returns the first row or `undefined`. Use for primary-key lookups. */
  selectOne<T>(query: string, params?: Params): T | undefined {
    return this.observed('selectOne', query, () => callGet(this.handle.prepare(query), params) as T | undefined)
  }

  insert(query: string, params?: Params): Database.RunResult {
    return this.observed('insert', query, () => callRun(this.handle.prepare(query), params))
  }

  update(query: string, params?: Params): Database.RunResult {
    return this.observed('update', query, () => callRun(this.handle.prepare(query), params))
  }

  delete(query: string, params?: Params): Database.RunResult {
    return this.observed('delete', query, () => callRun(this.handle.prepare(query), params))
  }

  /** Multi-statement DDL / scripts without params. */
  exec(query: string): void {
    this.observed('exec', query, () => this.handle.exec(query))
  }

  /** Synchronous transaction. `fn` runs inside a BEGIN…COMMIT (rolled back on throw). */
  transaction<T>(fn: () => T): T {
    return this.handle.transaction(fn)()
  }

  /** Escape hatch for advanced cases — prepared-statement reuse, custom binding, etc. */
  get raw(): Database.Database {
    return this.handle
  }

  private observed<T>(op: string, query: string, work: () => T): T {
    const startedAt = Date.now()
    try {
      const result = work()
      this.logSlow(op, query, Date.now() - startedAt)
      return result
    } catch (err) {
      this.logger.error('Query failed', {
        op,
        query: query.slice(0, 200),
        err: (err as Error).message,
      })
      throw err
    }
  }

  private logSlow(op: string, query: string, ms: number): void {
    if (ms < SLOW_QUERY_MS) return
    this.logger.warn('Slow query', { op, ms, query: query.slice(0, 200) })
  }
}

function callAll(stmt: Database.Statement, params?: Params): unknown[] {
  if (params === undefined) return stmt.all()
  if (Array.isArray(params)) return stmt.all(...params)
  return stmt.all(params)
}

function callGet(stmt: Database.Statement, params?: Params): unknown {
  if (params === undefined) return stmt.get()
  if (Array.isArray(params)) return stmt.get(...params)
  return stmt.get(params)
}

function callRun(stmt: Database.Statement, params?: Params): Database.RunResult {
  if (params === undefined) return stmt.run()
  if (Array.isArray(params)) return stmt.run(...params)
  return stmt.run(params)
}
