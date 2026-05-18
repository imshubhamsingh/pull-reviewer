import type { Db } from '@/main/db/db'
import type {
  PrState,
  PullRequestSummary,
  ReviewDecision,
} from '@/main/github/pull-request.service'
import { Service } from '@/main/service'

interface Row {
  repo: string
  pr_number: number
  pr_id: string
  title: string
  url: string
  author: string
  is_draft: number
  state: PrState
  pr_created_at: string
  pr_updated_at: string
  additions: number
  deletions: number
  changed_files: number
  review_decision: ReviewDecision
  last_opened_at: string
}

const COLUMNS = `
  repo, pr_number, pr_id, title, url, author, is_draft, state,
  pr_created_at, pr_updated_at, additions, deletions, changed_files,
  review_decision, last_opened_at
`

/**
 * Local cache of recently opened PRs. One row per (repo, pr_number).
 *
 * Populated on PrList click — every time the user navigates into a PR via the
 * app we upsert the current GitHub snapshot (title / state / diff / etc.) and
 * bump `last_opened_at`. The "Recents" tab then reads these rows ordered by
 * `last_opened_at desc` so the user can jump back to recent work without
 * waiting on a network roundtrip.
 */
export class PrRecentStore extends Service {
  constructor(private readonly db: Db) {
    super()
  }

  /** Most recently opened PRs, newest first. */
  list(limit = 50): PullRequestSummary[] {
    const rows = this.db.select<Row>(
      /* sql */ `SELECT ${COLUMNS} FROM pr_recents ORDER BY last_opened_at DESC LIMIT ?`,
      [limit],
    )
    return rows.map(toSummary)
  }

  /** Upsert and bump `last_opened_at` to now. */
  touch(pr: PullRequestSummary): void {
    const now = new Date().toISOString()
    this.db.insert(
      /* sql */ `
        INSERT INTO pr_recents (${COLUMNS})
        VALUES (
          @repo, @prNumber, @prId, @title, @url, @author, @isDraft, @state,
          @prCreatedAt, @prUpdatedAt, @additions, @deletions, @changedFiles,
          @reviewDecision, @lastOpenedAt
        )
        ON CONFLICT(repo, pr_number) DO UPDATE SET
          pr_id           = excluded.pr_id,
          title           = excluded.title,
          url             = excluded.url,
          author          = excluded.author,
          is_draft        = excluded.is_draft,
          state           = excluded.state,
          pr_created_at   = excluded.pr_created_at,
          pr_updated_at   = excluded.pr_updated_at,
          additions       = excluded.additions,
          deletions       = excluded.deletions,
          changed_files   = excluded.changed_files,
          review_decision = excluded.review_decision,
          last_opened_at  = excluded.last_opened_at
      `,
      {
        repo: pr.repo,
        prNumber: pr.number,
        prId: pr.id,
        title: pr.title,
        url: pr.url,
        author: pr.author,
        isDraft: pr.isDraft ? 1 : 0,
        state: pr.state,
        prCreatedAt: pr.createdAt,
        prUpdatedAt: pr.updatedAt,
        additions: pr.additions,
        deletions: pr.deletions,
        changedFiles: pr.changedFiles,
        reviewDecision: pr.reviewDecision,
        lastOpenedAt: now,
      },
    )
  }

  remove(repo: string, prNumber: number): boolean {
    const { changes } = this.db.delete(
      /* sql */ `DELETE FROM pr_recents WHERE repo = ? AND pr_number = ?`,
      [repo, prNumber],
    )
    return changes > 0
  }
}

function toSummary(row: Row): PullRequestSummary {
  return {
    id: row.pr_id,
    number: row.pr_number,
    title: row.title,
    url: row.url,
    repo: row.repo,
    author: row.author,
    isDraft: row.is_draft === 1,
    state: row.state,
    createdAt: row.pr_created_at,
    updatedAt: row.pr_updated_at,
    additions: row.additions,
    deletions: row.deletions,
    changedFiles: row.changed_files,
    reviewDecision: row.review_decision,
    // Recents are the local cache — we don't persist commit / review timing
    // since these change over time. They're filled in fresh for live tabs.
    lastCommitAt: null,
    viewerLatestReviewAt: null,
  }
}
