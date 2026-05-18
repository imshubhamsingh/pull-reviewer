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

  /**
   * Resolve a PR's base-branch commit SHA from GitHub. Used by the Diff pane
   * when the local tour record's `baseRefOid` is null (older tours). Cached
   * in the main process so repeat calls are cheap.
   */
  baseSha: (repo: string, prNumber: number) =>
    http.get<{ baseSha: string | null }>(`/api/pull-requests/${repo}/${prNumber}/base-sha`),
}
