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

  reanchor(id: number, line: number, startLine: number | null): ReviewDraftRecord | undefined {
    return this.drafts.updateRange(id, line, startLine)
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
    // Only delete drafts that actually made it to GitHub. Unresolvable drafts
    // stay in the local store, get marked with a persistent `lastSubmitError`
    // so the UI can flag them across app restarts, and the next edit / range
    // change clears the flag automatically.
    const unresolvable = new Set(submitted.unresolvableDraftIds)
    const errorReason = 'Line could not be resolved in the current diff hunks.'
    for (const d of pending) {
      if (unresolvable.has(d.id)) this.drafts.markSubmitError(d.id, errorReason)
      else this.drafts.remove(d.id)
    }
    return submitted
  }
}
