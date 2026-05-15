import { http } from '@/lib/api/base'
import type { PullRequestSummary } from '@/lib/api/types'

export const prs = {
  mine: () => http.get<PullRequestSummary[]>('/api/pull-requests/mine'),
  reviewRequested: () => http.get<PullRequestSummary[]>('/api/pull-requests/review-requested'),
  reviewedByMe: () => http.get<PullRequestSummary[]>('/api/pull-requests/reviewed-by-me'),

  /** Local cache of PRs the user has opened in this app, newest first. */
  recents: () => http.get<PullRequestSummary[]>('/api/pull-requests/recents'),

  /** Upsert the PR into the local recents cache and bump its last-opened time. */
  touchRecent: (pr: PullRequestSummary) =>
    http.post<{ ok: boolean }>('/api/pull-requests/recents/touch', pr),
}
