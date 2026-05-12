import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { CloneRegistry } from '@/main/git/clone-registry'
import type { GitRunner } from '@/main/git/git-runner'
import { Service } from '@/main/service'

const WORKTREE_DIR = 'worktrees'
const ORPHAN_THRESHOLD_MS = 60 * 60 * 1000   // 1h: anything older was abandoned

/**
 * Manages temporary worktrees of a sha. Each tour generation gets its own
 * worktree (so the tool-using LLM agent has a real filesystem to read), and
 * we remove it in the caller's `finally`. Orphans from crashes are swept on
 * startup.
 */
export class WorktreeManager extends Service {
  constructor(
    private readonly git: GitRunner,
    private readonly registry: CloneRegistry,
  ) {
    super()
  }

  /** Create a fresh worktree at the given sha. Caller MUST `remove()` when done. */
  async add(repo: string, sha: string): Promise<string> {
    await this.registry.ensureSha(repo, sha)
    const bare = this.registry.pathFor(repo)
    const wt = this.pathFor(repo, sha)
    await fs.rm(wt, { recursive: true, force: true })
    await this.git.run(['worktree', 'add', '--detach', wt, sha], { cwd: bare })
    return wt
  }

  async remove(wtPath: string): Promise<void> {
    const cleaned = await this.git.ok(['worktree', 'remove', '--force', wtPath])
    if (!cleaned) await fs.rm(wtPath, { recursive: true, force: true })
  }

  /**
   * Remove worktrees older than the orphan threshold. Called on app start to
   * clean up after crashes.
   */
  async sweepOrphans(): Promise<void> {
    const root = this.rootDir()
    const entries = await fs.readdir(root).catch(() => [] as string[])
    const cutoff = Date.now() - ORPHAN_THRESHOLD_MS

    for (const entry of entries) {
      const dir = path.join(root, entry)
      const stat = await fs.stat(dir).catch(() => null)
      if (!stat?.isDirectory() || stat.mtimeMs >= cutoff) continue
      this.logger.info('Sweeping orphan worktree', { dir })
      await this.remove(dir)
    }
  }

  private pathFor(repo: string, sha: string): string {
    return path.join(this.rootDir(), `${repo.replace('/', '__')}__${sha}`)
  }

  private rootDir(): string {
    return path.join(app.getPath('userData'), WORKTREE_DIR)
  }
}
