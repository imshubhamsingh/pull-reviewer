import type { GitHubCliService } from '@/main/github/github-cli.service'
import { Service } from '@/main/service'

export interface PrFile {
  path: string
  additions: number
  deletions: number
}

export interface PrCommit {
  sha: string
  subject: string
}

export interface PrContext {
  number: number
  repo: string
  title: string
  body: string
  files: PrFile[]
  commits: PrCommit[]
  diff: string
  diffBytes: number
  diffTruncated: boolean
  headRefOid: string
}

interface PrViewResponse {
  title: string
  body: string
  files: PrFile[]
  commits: { oid: string; messageHeadline: string }[]
  headRefOid: string
}

const DEFAULT_MAX_DIFF_BYTES = 60_000

const FIELDS = ['title', 'body', 'files', 'commits', 'headRefOid'] as const

export class PrContextCollector extends Service {
  constructor(private readonly gh: GitHubCliService) {
    super()
  }

  /**
   * Cheap probe for the live head sha — used by the cache to decide whether
   * a tour is stale without doing the full collect (which fetches the diff).
   */
  async collectHeadSha(prNumber: number, repo: string): Promise<string> {
    this.logger.info('Probing PR head sha', { prNumber, repo })
    const view = await this.gh.prView<{ headRefOid: string }>(prNumber, repo, ['headRefOid'])
    return view.headRefOid
  }

  async collect(
    prNumber: number,
    repo: string,
    opts: { maxDiffBytes?: number } = {},
  ): Promise<PrContext> {
    const max = opts.maxDiffBytes ?? DEFAULT_MAX_DIFF_BYTES
    this.logger.info('Collecting PR context', { prNumber, repo, max })

    const view = await this.gh.prView<PrViewResponse>(prNumber, repo, FIELDS)
    const rawDiff = await this.gh.prDiff(prNumber, repo)
    const fullBytes = Buffer.byteLength(rawDiff, 'utf8')
    const truncated = fullBytes > max
    const diff = truncated
      ? rawDiff.slice(0, max) + `\n\n[diff truncated: ${fullBytes - max} bytes omitted]`
      : rawDiff

    return {
      number: prNumber,
      repo,
      title: view.title,
      body: view.body,
      files: view.files,
      commits: view.commits.map((c) => ({ sha: c.oid, subject: c.messageHeadline })),
      diff,
      diffBytes: truncated ? max : fullBytes,
      diffTruncated: truncated,
      headRefOid: view.headRefOid,
    }
  }
}
