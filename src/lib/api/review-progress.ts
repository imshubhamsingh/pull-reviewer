import { http } from '@/lib/api/base'
import type { ChapterCompletion, FileReview } from '@/lib/api/types'

/**
 * Two namespaces:
 *  - chapters: per-chapter completion flags
 *  - files:    per-file reviewed flags (single-mark via markMany with a 1-element array)
 *
 * URL shape: /api/review-progress/<owner>/<name>/<pr>/<headSha>/... — all four
 * scope fields are path segments so each request is self-describing.
 */
export const reviewProgress = {
  chapters: {
    list: (repo: string, prNumber: number, headSha: string) =>
      http.get<ChapterCompletion[]>(
        `/api/review-progress/${repo}/${prNumber}/${encodeURIComponent(headSha)}/chapters`,
      ),
    mark: (repo: string, prNumber: number, headSha: string, chapterId: string) =>
      http.post<ChapterCompletion>(
        `/api/review-progress/${repo}/${prNumber}/${encodeURIComponent(headSha)}/chapters/${encodeURIComponent(chapterId)}`,
      ),
    unmark: (repo: string, prNumber: number, headSha: string, chapterId: string) =>
      http.del<{ deleted: boolean }>(
        `/api/review-progress/${repo}/${prNumber}/${encodeURIComponent(headSha)}/chapters/${encodeURIComponent(chapterId)}`,
      ),
  },
  files: {
    list: (repo: string, prNumber: number, headSha: string) =>
      http.get<FileReview[]>(
        `/api/review-progress/${repo}/${prNumber}/${encodeURIComponent(headSha)}/files`,
      ),
    /** Bulk-mark. Used by single-tick (filePaths: [path]) and chapter-complete cascade. */
    markMany: (repo: string, prNumber: number, headSha: string, filePaths: string[]) =>
      http.post<FileReview[]>(
        `/api/review-progress/${repo}/${prNumber}/${encodeURIComponent(headSha)}/files`,
        { filePaths },
      ),
    unmark: (repo: string, prNumber: number, headSha: string, filePath: string) =>
      http.del<{ deleted: boolean }>(
        `/api/review-progress/${repo}/${prNumber}/${encodeURIComponent(headSha)}/files/${encodeURIComponent(filePath)}`,
      ),
  },
}
