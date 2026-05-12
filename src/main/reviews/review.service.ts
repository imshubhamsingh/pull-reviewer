import { Service } from '@/main/service'
import type {
  ReviewDraftInput,
  ReviewDraftRecord,
  ReviewDraftStore,
} from '@/main/reviews/review-draft.store'
import type { ReviewSubmitter, SubmittedReview } from '@/main/reviews/review.submitter'

export interface SubmitInput {
  repo: string
  prNumber: number
  headSha: string
  summary?: string
  event?: 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE'
}

/** Facade over the drafts store + GitHub submitter. */
export class ReviewService extends Service {
  constructor(
    private readonly drafts: ReviewDraftStore,
    private readonly submitter: ReviewSubmitter,
  ) {
    super()
  }

  list(repo: string, prNumber: number): ReviewDraftRecord[] {
    return this.drafts.list(repo, prNumber)
  }

  create(input: ReviewDraftInput): ReviewDraftRecord {
    return this.drafts.create(input)
  }

  update(id: number, body: string): ReviewDraftRecord | undefined {
    return this.drafts.updateBody(id, body)
  }

  remove(id: number): boolean {
    return this.drafts.remove(id)
  }

  async submit(input: SubmitInput): Promise<SubmittedReview> {
    const pending = this.drafts.list(input.repo, input.prNumber)
    const submitted = await this.submitter.submit({
      repo: input.repo,
      prNumber: input.prNumber,
      drafts: pending,
      headSha: input.headSha,
      summary: input.summary,
      event: input.event,
    })
    this.drafts.removeAll(input.repo, input.prNumber)
    return submitted
  }
}
