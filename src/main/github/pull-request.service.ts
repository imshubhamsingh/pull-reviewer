import { graphql } from '@octokit/graphql'
import type { AuthService } from '@/main/auth/auth.service'
import { Service } from '@/main/service'

export interface PullRequestSummary {
  id: string
  number: number
  title: string
  url: string
  repo: string
  author: string
  isDraft: boolean
  updatedAt: string
}

interface SearchNode {
  id: string
  number: number
  title: string
  url: string
  isDraft: boolean
  updatedAt: string
  author: { login: string } | null
  repository: { nameWithOwner: string }
}

const QUERY = `
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes {
        ... on PullRequest {
          id number title url isDraft updatedAt
          author { login }
          repository { nameWithOwner }
        }
      }
    }
  }
`

export class PullRequestService extends Service {
  constructor(private readonly auth: AuthService) {
    super()
  }

  async listMine(): Promise<PullRequestSummary[]> {
    return this.search('is:pr is:open author:@me archived:false')
  }

  async listReviewRequested(): Promise<PullRequestSummary[]> {
    return this.search('is:pr is:open review-requested:@me archived:false')
  }

  async listAssigned(): Promise<PullRequestSummary[]> {
    return this.search('is:pr is:open assignee:@me archived:false')
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
        updatedAt: n.updatedAt,
      }))
  }
}
