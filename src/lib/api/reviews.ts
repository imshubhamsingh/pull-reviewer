import { http } from '@/lib/api/base'
import type {
  CreateDraftInput,
  ReviewDraft,
  SubmitReviewInput,
  SubmittedReview,
} from '@/lib/api/types'

export const reviews = {
  list: (repo: string, prNumber: number) =>
    http.get<ReviewDraft[]>(`/api/reviews/${repo}/${prNumber}/drafts`),
  create: (repo: string, prNumber: number, input: CreateDraftInput) =>
    http.post<ReviewDraft>(`/api/reviews/${repo}/${prNumber}/drafts`, input),
  update: (id: number, body: string) =>
    http.patch<ReviewDraft>(`/api/reviews/drafts/${id}`, { body }),
  /** Re-anchor a draft to a new line / line range; pass `startLine = null` for a single line. */
  reanchor: (id: number, line: number, startLine: number | null) =>
    http.patch<ReviewDraft>(`/api/reviews/drafts/${id}`, { line, startLine }),
  remove: (id: number) => http.del<{ deleted: boolean }>(`/api/reviews/drafts/${id}`),
  submit: (repo: string, prNumber: number, input: SubmitReviewInput) =>
    http.post<SubmittedReview>(`/api/reviews/${repo}/${prNumber}/submit`, input),
}
