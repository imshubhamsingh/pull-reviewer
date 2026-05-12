import type { AuthService } from '@/main/auth/auth.service'
import { Service } from '@/main/service'
import type { ReviewDraftRecord } from '@/main/reviews/review-draft.store'

export interface SubmitOptions {
  repo: string
  prNumber: number
  drafts: ReviewDraftRecord[]
  headSha: string
  summary?: string
  event?: 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE'
}

export interface SubmittedReview {
  id: number
  htmlUrl: string
}

interface CommentPayload {
  path: string
  line: number
  side: 'LEFT' | 'RIGHT'
  start_line?: number
  start_side?: 'LEFT' | 'RIGHT'
  body: string
}

interface ReviewResponse {
  id: number
  html_url: string
}

/** Posts a pending-drafts batch as a single GitHub review. */
export class ReviewSubmitter extends Service {
  constructor(private readonly auth: AuthService) {
    super()
  }

  async submit({ repo, prNumber, drafts, headSha, summary, event = 'COMMENT' }: SubmitOptions): Promise<SubmittedReview> {
    if (drafts.length === 0) throw new Error('No drafts to submit')

    const token = await this.auth.getToken()
    const url = `https://api.github.com/repos/${repo}/pulls/${prNumber}/reviews`
    const body = {
      commit_id: headSha,
      event,
      body: summary ?? undefined,
      comments: drafts.map((d): CommentPayload => {
        const side = d.side === 'before' ? 'LEFT' : 'RIGHT'
        const isRange = d.startLine != null && d.startLine !== d.line
        return {
          path: d.file,
          line: d.line,
          side,
          ...(isRange ? { start_line: d.startLine!, start_side: side } : {}),
          body: d.body,
        }
      }),
    }

    this.logger.info('Submitting review', { repo, prNumber, draftCount: drafts.length, event })
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        Authorization: `token ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`GitHub review POST ${response.status}: ${text}`)
    }

    const data = await response.json() as ReviewResponse
    return { id: data.id, htmlUrl: data.html_url }
  }
}
