import type { AuthService } from '@/main/auth/auth.service'
import { Service } from '@/main/service'
import { parsePatchHunks, type FileHunks } from '@/main/reviews/pr-hunks'

/**
 * Per-file diff-hunk metadata served to the renderer so it can show users
 * which lines accept review comments. RLE-encoded line ranges (`[start,end]`
 * inclusive) keep the wire small even when a file has long contiguous hunks.
 */
export interface HunksRange {
  right: [number, number][]
  left: [number, number][]
}

export interface HunksResponse {
  /** True when the PR has more changed files than the GitHub Files API returned in the paged scan. */
  truncated: boolean
  files: Record<string, HunksRange>
}

interface CacheEntry {
  response: HunksResponse
}

const MAX_PAGES = 5
const MAX_FILES_PER_PAGE = 100
const CACHE_CAP = 20

/**
 * Resolves a PR's commentable-line ranges from the GitHub Files API. Pages up
 * to 500 files (5 × 100) with early-stop on a partial page. Caches per
 * `(repo, prNumber, headSha)` in a small Map-based LRU so repeat opens
 * within a session don't re-hit GitHub. The renderer layers its own IDB
 * persistence on top so app restarts also hit the cache.
 */
export class HunksService extends Service {
  private readonly cache = new Map<string, CacheEntry>()

  constructor(private readonly auth: AuthService) {
    super()
  }

  async getOrFetch(repo: string, prNumber: number, headSha: string): Promise<HunksResponse> {
    const key = cacheKey(repo, prNumber, headSha)
    const hit = this.cache.get(key)
    if (hit) {
      // LRU touch — re-insert to move to MRU end.
      this.cache.delete(key)
      this.cache.set(key, hit)
      return hit.response
    }
    const response = await this.fetchAndEncode(repo, prNumber)
    this.cache.set(key, { response })
    while (this.cache.size > CACHE_CAP) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey == null) break
      this.cache.delete(oldestKey)
    }
    return response
  }

  private async fetchAndEncode(repo: string, prNumber: number): Promise<HunksResponse> {
    const token = await this.auth.getToken()
    const files: Record<string, HunksRange> = {}
    let page = 1
    let totalFiles = 0
    let truncated = false
    while (page <= MAX_PAGES) {
      const url = `https://api.github.com/repos/${repo}/pulls/${prNumber}/files?per_page=${MAX_FILES_PER_PAGE}&page=${page}`
      const res = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `token ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
      if (!res.ok) throw new Error(`GitHub files GET ${res.status}: ${await res.text()}`)
      const pageFiles = (await res.json()) as Array<{ filename: string; patch?: string }>
      totalFiles += pageFiles.length
      for (const f of pageFiles) {
        if (!f.patch) continue
        files[f.filename] = encodeRanges(parsePatchHunks(f.patch))
      }
      if (pageFiles.length < MAX_FILES_PER_PAGE) break
      if (page === MAX_PAGES) {
        // We filled the last allowed page; assume more exist.
        truncated = true
      }
      page += 1
    }
    this.logger.info('Resolved PR hunks', {
      repo,
      prNumber,
      totalFiles,
      pageCount: page,
      truncated,
    })
    return { truncated, files }
  }
}

function cacheKey(repo: string, prNumber: number, headSha: string): string {
  return `${repo}#${prNumber}@${headSha}`
}

function encodeRanges(hunks: FileHunks): HunksRange {
  return { right: rleRanges(hunks.rightLines), left: rleRanges(hunks.leftLines) }
}

/**
 * Compress a set of line numbers into sorted, inclusive `[start, end]` ranges.
 * The renderer expands these back to a `Set<number>` lazily on first use per
 * file — RLE is purely a wire-format thing.
 */
function rleRanges(lines: Set<number>): [number, number][] {
  const sorted = [...lines].sort((a, b) => a - b)
  if (sorted.length === 0) return []
  const first = sorted[0]!
  const out: [number, number][] = []
  let start = first
  let end = first
  for (let i = 1; i < sorted.length; i += 1) {
    const n = sorted[i]!
    if (n === end + 1) {
      end = n
    } else {
      out.push([start, end])
      start = n
      end = n
    }
  }
  out.push([start, end])
  return out
}
