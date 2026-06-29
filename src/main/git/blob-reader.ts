import type { CloneRegistry } from '@/main/git/clone-registry'
import type { GitRunner } from '@/main/git/git-runner'
import { Service } from '@/main/service'

/**
 * Soft cap above which we report a file as `encoding: 'omitted'` instead of
 * streaming its contents through the IPC. The renderer doesn't crash on big
 * files, but Shiki tokenization grinds on 1 MB+ JSON / lockfiles. 1 MB is
 * generous enough to cover most real-world source + generated files
 * (375-page yarn.lock, large schema dumps) without paying the perf cost on
 * the ~5 MB outliers. Bumped from 256 KB after that limit hid 300-500 KB
 * snapshots reviewers actually wanted to read inline.
 */
export const MAX_INLINE_BYTES = 1024 * 1024

export type BlobEncoding = 'utf8' | 'base64' | 'omitted'

export interface BlobResult {
  /** UTF-8 text, base64-encoded binary, or null when omitted. */
  content: string | null
  encoding: BlobEncoding
  /** Real file size in bytes, regardless of encoding/omitted state. */
  size: number
}

/**
 * Reads a file at a given sha from a repo's bare clone using `git show`.
 * Big files and binary blobs are reported with `encoding: 'omitted' | 'base64'`
 * so callers can render a fallback instead of crashing the renderer.
 */
export class BlobReader extends Service {
  constructor(
    private readonly git: GitRunner,
    private readonly registry: CloneRegistry,
  ) {
    super()
  }

  async read(
    repo: string,
    sha: string,
    filePath: string,
    maxBytes = MAX_INLINE_BYTES,
  ): Promise<BlobResult> {
    await this.registry.ensureSha(repo, sha)
    const dir = this.registry.pathFor(repo)

    const blobSha = await this.resolveBlobSha(dir, sha, filePath)
    if (!blobSha) return omitted(0)

    const size = await this.blobSize(dir, blobSha)
    if (size > maxBytes) return omitted(size)

    const buf = await this.git.runBuffer(['cat-file', 'blob', blobSha], { cwd: dir })
    return isText(buf)
      ? { content: buf.toString('utf8'), encoding: 'utf8', size }
      : { content: buf.toString('base64'), encoding: 'base64', size }
  }

  private async resolveBlobSha(dir: string, sha: string, filePath: string): Promise<string | null> {
    try {
      const out = await this.git.run(['rev-parse', `${sha}:${filePath}`], { cwd: dir })
      return out.trim() || null
    } catch {
      return null
    }
  }

  private async blobSize(dir: string, blobSha: string): Promise<number> {
    const out = await this.git.run(['cat-file', '-s', blobSha], { cwd: dir })
    return Number(out.trim())
  }
}

function omitted(size: number): BlobResult {
  return { content: null, encoding: 'omitted', size }
}

function isText(buf: Buffer): boolean {
  for (let i = 0; i < Math.min(buf.length, 8192); i++) {
    if (buf[i] === 0) return false
  }
  return true
}
