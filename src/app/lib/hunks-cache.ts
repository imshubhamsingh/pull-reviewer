import { openDB, type IDBPDatabase } from 'idb'
import type { HunksResponse } from '@/lib/api'

/**
 * Client-side persistence for resolved PR hunks. Keyed by
 * `${repo}#${prNumber}@${headSha}`; survives app restarts so a returning user
 * sees commentable-line highlights instantly without hitting GitHub.
 *
 * Eviction is LRU by `storedAt` once the store grows past `CACHE_CAP`. New
 * PR/SHA pairs come and go fast (one per PR open), so the small cap is enough
 * to cover a normal review session.
 */

const DB_NAME = 'pull-reviewer-hunks'
const DB_VERSION = 1
const STORE = 'hunks'
const CACHE_CAP = 20

export interface CachedHunksEntry {
  key: string
  response: HunksResponse
  storedAt: number
}

let dbPromise: Promise<IDBPDatabase> | null = null

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'key' })
        }
      },
    })
  }
  return dbPromise
}

export function hunksCacheKey(repo: string, prNumber: number, headSha: string): string {
  return `${repo}#${prNumber}@${headSha}`
}

export async function getCachedHunks(key: string): Promise<HunksResponse | null> {
  try {
    const entry = (await (await db()).get(STORE, key)) as CachedHunksEntry | undefined
    return entry?.response ?? null
  } catch {
    // IDB unavailable (private mode, denied, etc.) — silently fall through to
    // a network fetch. The visual indicator is non-essential.
    return null
  }
}

export async function putCachedHunks(key: string, response: HunksResponse): Promise<void> {
  try {
    const handle = await db()
    await handle.put(STORE, { key, response, storedAt: Date.now() } satisfies CachedHunksEntry)
    await evictIfFull(handle)
  } catch {
    // See note in getCachedHunks — IDB is best-effort.
  }
}

async function evictIfFull(handle: IDBPDatabase): Promise<void> {
  const count = await handle.count(STORE)
  if (count <= CACHE_CAP) return
  const entries = (await handle.getAll(STORE)) as CachedHunksEntry[]
  entries.sort((a, b) => a.storedAt - b.storedAt)
  const toEvict = entries.slice(0, count - CACHE_CAP)
  for (const entry of toEvict) {
    await handle.delete(STORE, entry.key)
  }
}
