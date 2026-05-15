import type { FileReviewRecord, FileReviewStore } from '@/main/tour/file-review.store'
import { Service } from '@/main/service'

/**
 * Thin passthrough over `FileReviewStore`. Exists for symmetry with
 * `ChapterCompletionService` and to give future logic (e.g., file-review
 * analytics) a home.
 */
export class FileReviewService extends Service {
  constructor(private readonly store: FileReviewStore) {
    super()
  }

  list(repo: string, prNumber: number, headRefOid: string): FileReviewRecord[] {
    return this.store.list(repo, prNumber, headRefOid)
  }

  markMany(repo: string, prNumber: number, headRefOid: string, filePaths: string[]): FileReviewRecord[] {
    return this.store.markMany(repo, prNumber, headRefOid, filePaths)
  }

  unmark(repo: string, prNumber: number, headRefOid: string, filePath: string): boolean {
    return this.store.unmark(repo, prNumber, headRefOid, filePath)
  }
}
