import type { ChapterCompletionRecord, ChapterCompletionStore } from '@/main/tour/chapter-completion.store'
import { Service } from '@/main/service'

/**
 * Thin passthrough over `ChapterCompletionStore`. Lives as its own service so
 * future logic (analytics, webhook sync, validation against the cached tour)
 * has a home without churning the renderer.
 */
export class ChapterCompletionService extends Service {
  constructor(private readonly store: ChapterCompletionStore) {
    super()
  }

  list(repo: string, prNumber: number, headRefOid: string): ChapterCompletionRecord[] {
    return this.store.list(repo, prNumber, headRefOid)
  }

  mark(repo: string, prNumber: number, headRefOid: string, chapterId: string): ChapterCompletionRecord {
    return this.store.mark({ repo, prNumber, headRefOid, chapterId })
  }

  unmark(repo: string, prNumber: number, headRefOid: string, chapterId: string): boolean {
    return this.store.unmark(repo, prNumber, headRefOid, chapterId)
  }
}
