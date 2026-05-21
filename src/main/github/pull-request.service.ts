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
  /** Most-recent commit timestamp on the PR's head branch — used by the Reviewed badge. */
  lastCommitAt: string | null
  /** Submission timestamp of the viewer's latest review on this PR; null if the viewer hasn't reviewed. */
  viewerLatestReviewAt: string | null
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
  commits: { nodes: Array<{ commit: { committedDate: string } }> } | null
  reviews: {
    nodes: Array<{ author: { login: string } | null; submittedAt: string | null }>
  } | null
}

const QUERY = `
  query($q: String!) {
    viewer { login }
    search(query: $q, type: ISSUE, first: 50) {
      nodes {
        ... on PullRequest {
          id number title url isDraft state createdAt updatedAt
          additions deletions changedFiles reviewDecision
          author { login }
          repository { nameWithOwner }
          commits(last: 1) { nodes { commit { committedDate } } }
          reviews(last: 30) { nodes { author { login } submittedAt } }
        }
      }
    }
  }
`

const BASE_REF_OID_QUERY = `
  query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        baseRefOid
      }
    }
  }
`

export class PullRequestService extends Service {
  /** In-memory cache of `(repo, prNumber) → baseRefOid`. The base SHA of a PR
   * almost never changes (only on rebase), so a process-lifetime cache is
   * enough to keep the Diff toggle instant on repeat visits. */
  private readonly baseShaCache = new Map<string, string>()

  constructor(
    private readonly auth: AuthService,
    private readonly recents: PrRecentStore,
  ) {
    super()
  }

  /**
   * Resolve the current base-branch commit SHA for a PR. Used by the Diff
   * pane when the local tour record's `baseRefOid` is null (older tours that
   * didn't capture it at generation time). Cached in-process.
   */
  async resolveBaseSha(repo: string, prNumber: number): Promise<string | null> {
    const key = `${repo}#${prNumber}`
    const cached = this.baseShaCache.get(key)
    if (cached) return cached
    const [owner, name] = repo.split('/')
    if (!owner || !name) return null
    const token = await this.auth.getToken()
    const client = graphql.defaults({ headers: { authorization: `token ${token}` } })
    const data = await client<{
      repository: { pullRequest: { baseRefOid: string | null } | null } | null
    }>(BASE_REF_OID_QUERY, { owner, name, number: prNumber })
    const oid = data.repository?.pullRequest?.baseRefOid ?? null
    if (oid) this.baseShaCache.set(key, oid)
    return oid
  }

  /** Local cache of recently opened PRs, newest first. Returns whatever the
   *  store has now — does NOT hit GitHub. Use `refreshRecents()` first when
   *  the caller wants fresh state. */
  listRecents(): PullRequestSummary[] {
    return this.recents.list()
  }

  /**
   * Refresh each cached recent's live state by batch-querying GitHub via
   * `node(id: ...)`. Upserts the fresh shape back into the store so the next
   * `listRecents()` call returns the latest. Idempotent; cheap when the
   * recents list is small (which it is — capped at 50).
   *
   * Failures fall through silently per-PR — a 404 (PR deleted) just leaves
   * the stale row in place; a network error bubbles up.
   */
  async refreshRecents(): Promise<PullRequestSummary[]> {
    const cached = this.recents.list()
    if (cached.length === 0) return cached
    this.logger.info('Refreshing recents from GitHub', { count: cached.length })
    const token = await this.auth.getToken()
    const client = graphql.defaults({ headers: { authorization: `token ${token}` } })
    const ids = cached.map((pr) => pr.id)
    const query = buildNodeBatchQuery(ids)
    const data = await client<Record<string, SearchNode | null> & { viewer: { login: string } }>(
      query,
    )
    const viewerLogin = data.viewer.login
    for (let i = 0; i < ids.length; i++) {
      const node = data[`pr${i}`]
      if (!node) continue
      this.recents.touchKeepOpenedAt(searchNodeToSummary(node, viewerLogin))
    }
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
    const data = await client<{
      viewer: { login: string }
      search: { nodes: Array<Partial<SearchNode>> }
    }>(QUERY, { q })
    const viewerLogin = data.viewer.login
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
        lastCommitAt: n.commits?.nodes?.[0]?.commit?.committedDate ?? null,
        viewerLatestReviewAt: latestReviewBy(n.reviews?.nodes ?? [], viewerLogin),
      }))
  }
}

/** Most-recent `submittedAt` for the given reviewer; null if they haven't reviewed yet. */
function latestReviewBy(
  reviews: Array<{ author: { login: string } | null; submittedAt: string | null }>,
  viewer: string,
): string | null {
  let latest: string | null = null
  for (const r of reviews) {
    if (r.author?.login !== viewer) continue
    if (!r.submittedAt) continue
    if (latest == null || r.submittedAt > latest) latest = r.submittedAt
  }
  return latest
}

/**
 * Build a single GraphQL document that fetches each PR node by id with an
 * alias `pr0` / `pr1` / … . Plus a `viewer { login }` field so we can
 * compute `viewerLatestReviewAt` from the reviews list.
 */
function buildNodeBatchQuery(ids: string[]): string {
  const aliases = ids
    .map(
      (id, i) => `
    pr${i}: node(id: ${JSON.stringify(id)}) {
      ... on PullRequest {
        id number title url isDraft state createdAt updatedAt
        additions deletions changedFiles reviewDecision
        author { login }
        repository { nameWithOwner }
        commits(last: 1) { nodes { commit { committedDate } } }
        reviews(last: 30) { nodes { author { login } submittedAt } }
      }
    }`,
    )
    .join('\n')
  return `query { viewer { login } ${aliases} }`
}

function searchNodeToSummary(n: SearchNode, viewerLogin: string): PullRequestSummary {
  return {
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
    lastCommitAt: n.commits?.nodes?.[0]?.commit?.committedDate ?? null,
    viewerLatestReviewAt: latestReviewBy(n.reviews?.nodes ?? [], viewerLogin),
  }
}
