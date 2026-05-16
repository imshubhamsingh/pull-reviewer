import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { CloneStore } from '@/main/git/clone.store'
import type { GitRunner } from '@/main/git/git-runner'
import { Service } from '@/main/service'

/**
 * Owns the on-disk layout for bare clones and is responsible for ensuring
 * one exists for any repo we touch. Other classes ask for a clone path
 * via `ensureBare(repo)` — they don't need to know the layout rules.
 */
export class CloneRegistry extends Service {
  constructor(
    private readonly git: GitRunner,
    private readonly store: CloneStore,
  ) {
    super()
  }

  /** Filesystem path where this repo's bare clone lives. Pure derivation, no IO. */
  pathFor(repo: string): string {
    return path.join(app.getPath('userData'), 'repos', repo.replace('/', '__') + '.git')
  }

  /** Ensure a bare blobless clone exists on disk. Returns the absolute path. */
  async ensureBare(repo: string): Promise<string> {
    const dir = this.pathFor(repo)
    if (await exists(dir)) {
      this.store.touchAccessed(repo)
      return dir
    }
    this.logger.info('Cloning repo (bare, blobless)', { repo, dir })
    await fs.mkdir(path.dirname(dir), { recursive: true })
    await this.git.run([
      'clone',
      '--bare',
      '--filter=blob:none',
      `https://github.com/${repo}.git`,
      dir,
    ])
    const now = new Date().toISOString()
    this.store.upsert({ repo, path: dir, clonedAt: now, lastFetchedAt: now, lastAccessedAt: now })
    return dir
  }

  /** Ensure `sha` is present in the clone (fetch on demand). */
  async ensureSha(repo: string, sha: string): Promise<void> {
    const dir = await this.ensureBare(repo)
    const present = await this.git.ok(['cat-file', '-e', `${sha}^{commit}`], { cwd: dir })
    if (present) return
    this.logger.info('Fetching sha', { repo, sha })
    await this.git.run(['fetch', '--filter=blob:none', 'origin', sha], { cwd: dir })
    this.store.touchFetched(repo)
  }
}

async function exists(p: string): Promise<boolean> {
  return fs
    .access(p)
    .then(() => true)
    .catch(() => false)
}
