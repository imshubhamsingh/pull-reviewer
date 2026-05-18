import type { AuthService } from '@/main/auth/auth.service'
import { Service } from '@/main/service'
import type { ReviewDraftRecord } from '@/main/reviews/review-draft.store'
import { parsePatchHunks, type FileHunks } from '@/main/reviews/pr-hunks'

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
  /** Drafts skipped because their line couldn't be resolved against the current diff hunks. */
  unresolvableDraftIds: number[]
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

  async submit({
    repo,
    prNumber,
    drafts,
    headSha,
    summary,
    event = 'COMMENT',
  }: SubmitOptions): Promise<SubmittedReview> {
    if (drafts.length === 0) throw new Error('No drafts to submit')
    const token = await this.auth.getToken()

    // Pre-validate every draft's line against the current diff hunks.
    // GitHub rejects the whole batch with 422 if even one comment lands on a
    // line outside the diff; isolating the bad ones up front lets us submit
    // the rest AND tell the user which drafts to fix.
    const hunks = await this.fetchHunks(token, repo, prNumber)
    const { resolvable, unresolvable } = splitByResolvability(drafts, hunks)
    if (unresolvable.length > 0) {
      this.logger.warn('Skipping unresolvable drafts on submit', {
        repo,
        prNumber,
        unresolvable: unresolvable.map((d) => ({ id: d.id, file: d.file, line: d.line })),
      })
    }
    if (resolvable.length === 0) {
      throw new Error(
        `All ${drafts.length} draft(s) point at lines outside the current diff hunks. ` +
          `Re-anchor them (use the Range editor on each pending comment) before submitting.`,
      )
    }

    const url = `https://api.github.com/repos/${repo}/pulls/${prNumber}/reviews`
    const body = {
      commit_id: headSha,
      event,
      body: summary ?? undefined,
      comments: resolvable.map((d): CommentPayload => {
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

    this.logger.info('Submitting review', {
      repo,
      prNumber,
      submitting: resolvable.length,
      skipped: unresolvable.length,
      event,
    })
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

    const data = (await response.json()) as ReviewResponse
    return {
      id: data.id,
      htmlUrl: data.html_url,
      unresolvableDraftIds: unresolvable.map((d) => d.id),
    }
  }

  /**
   * Fetch the PR's changed files + patches, then parse each patch into the
   * set of (post-image) line numbers GitHub will accept a comment on. Lives
   * on the submitter so the service layer doesn't need to know about diff
   * grammar.
   */
  private async fetchHunks(
    token: string,
    repo: string,
    prNumber: number,
  ): Promise<Map<string, FileHunks>> {
    const out = new Map<string, FileHunks>()
    let page = 1
    // GitHub paginates files at 100 per page. PRs with >300 files are rare;
    // cap at 3 pages to avoid runaway requests.
    while (page <= 3) {
      const url = `https://api.github.com/repos/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`
      const res = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `token ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
      if (!res.ok) throw new Error(`GitHub files GET ${res.status}: ${await res.text()}`)
      const files = (await res.json()) as Array<{ filename: string; patch?: string }>
      for (const f of files) {
        if (!f.patch) continue
        out.set(f.filename, parsePatchHunks(f.patch))
      }
      if (files.length < 100) break
      page += 1
    }
    return out
  }
}

function splitByResolvability(
  drafts: ReviewDraftRecord[],
  hunks: Map<string, FileHunks>,
): { resolvable: ReviewDraftRecord[]; unresolvable: ReviewDraftRecord[] } {
  const resolvable: ReviewDraftRecord[] = []
  const unresolvable: ReviewDraftRecord[] = []
  for (const d of drafts) {
    if (isDraftResolvable(d, hunks)) resolvable.push(d)
    else unresolvable.push(d)
  }
  return { resolvable, unresolvable }
}

function isDraftResolvable(d: ReviewDraftRecord, hunks: Map<string, FileHunks>): boolean {
  const fh = hunks.get(d.file)
  if (!fh) return false
  const set = d.side === 'before' ? fh.leftLines : fh.rightLines
  if (!set.has(d.line)) return false
  if (d.startLine != null && d.startLine !== d.line && !set.has(d.startLine)) return false
  return true
}
