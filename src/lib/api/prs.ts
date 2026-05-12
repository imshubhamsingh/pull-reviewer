import { http } from '@/lib/api/base'
import type { PullRequestSummary } from '@/lib/api/types'

export const prs = {
  mine: () => http.get<PullRequestSummary[]>('/api/pull-requests/mine'),
  reviewRequested: () => http.get<PullRequestSummary[]>('/api/pull-requests/review-requested'),
}
