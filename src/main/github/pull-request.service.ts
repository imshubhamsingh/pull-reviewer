import { graphql } from '@octokit/graphql'
import type { AuthService } from '@/main/auth/auth.service'
import type { PrRecentStore } from '@/main/github/pr-recent.store'
import { Service } from '@/main/service'

export type PrState = 'OPEN' | 'CLOSED' | 'MERGED'
export type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null

export interface PullRequestSummary {
  id: string
  number: number
  title: string
  url: string
  repo: string
  author: string
  isDraft: boolean
  state: PrState
  createdAt: string
  updatedAt: string
  additions: number
  deletions: number
  changedFiles: number
  reviewDecision: ReviewDecision
}

interface SearchNode {
  id: string
  number: number
  title: string
  url: string
  isDraft: boolean
  state: PrState
  createdAt: string
  updatedAt: string
  additions: number
  deletions: number
  changedFiles: number
  reviewDecision: ReviewDecision
  author: { login: string } | null
  repository: { nameWithOwner: string }
}

const QUERY = `
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes {
        ... on PullRequest {
          id number title url isDraft state createdAt updatedAt
          additions deletions changedFiles reviewDecision
          author { login }
          repository { nameWithOwner }
        }
      }
    }
  }
`

export class PullRequestService extends Service {
  constructor(
    private readonly auth: AuthService,
    private readonly recents: PrRecentStore,
  ) {
    super()
  }

  /** Local cache of recently opened PRs, newest first. */
  listRecents(): PullRequestSummary[] {
    return this.recents.list()
  }

  /** Upsert + bump `last_opened_at`. Called when the renderer opens a PR. */
  touchRecent(pr: PullRequestSummary): void {
    this.recents.touch(pr)
  }

  async listMine(): Promise<PullRequestSummary[]> {
    return this.search('is:pr is:open author:@me archived:false')
  }

  async listReviewRequested(): Promise<PullRequestSummary[]> {
    return this.search('is:pr is:open review-requested:@me archived:false')
  }

  /**
   * PRs the current user has submitted at least one review on. Includes
   * closed/merged so the user can still find old reviewed PRs for reference.
   * Sorted by most-recently-updated so the latest activity surfaces first.
   */
  async listReviewedByMe(): Promise<PullRequestSummary[]> {
    return this.search('is:pr reviewed-by:@me archived:false sort:updated-desc')
  }

  private async search(q: string): Promise<PullRequestSummary[]> {
    this.logger.info('Searching pull requests', { q })
    const token = await this.auth.getToken()
    const client = graphql.defaults({ headers: { authorization: `token ${token}` } })
    const data = await client<{ search: { nodes: Array<Partial<SearchNode>> } }>(QUERY, { q })
    return data.search.nodes
      .filter((n): n is SearchNode => n.repository != null && n.id != null)
      .map((n) => ({
        id: n.id,
        number: n.number,
        title: n.title,
        url: n.url,
        repo: n.repository.nameWithOwner,
        author: n.author?.login ?? 'unknown',
        isDraft: n.isDraft,
        state: n.state,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        additions: n.additions ?? 0,
        deletions: n.deletions ?? 0,
        changedFiles: n.changedFiles ?? 0,
        reviewDecision: n.reviewDecision ?? null,
      }))
  }
}
