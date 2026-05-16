import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Service } from '@/main/service'

const exec = promisify(execFile)

const MAX_BUFFER = 16 * 1024 * 1024

export class GitHubCliService extends Service {
  async run(args: string[]): Promise<string> {
    this.logger.info('Running gh', { args })
    const { stdout } = await exec('gh', args, { maxBuffer: MAX_BUFFER })
    return stdout
  }

  async runJson<T>(args: string[]): Promise<T> {
    const out = await this.run(args)
    return JSON.parse(out) as T
  }

  async prDiff(prNumber: number, repo: string): Promise<string> {
    return this.run(['pr', 'diff', String(prNumber), '-R', repo])
  }

  async prView<T>(prNumber: number, repo: string, fields: readonly string[]): Promise<T> {
    return this.runJson<T>(['pr', 'view', String(prNumber), '-R', repo, '--json', fields.join(',')])
  }

  async prMerge(
    prNumber: number,
    repo: string,
    method: 'squash' | 'merge' | 'rebase',
  ): Promise<void> {
    await this.run(['pr', 'merge', String(prNumber), '-R', repo, `--${method}`])
  }

  async prComment(prNumber: number, repo: string, body: string): Promise<void> {
    await this.run(['pr', 'comment', String(prNumber), '-R', repo, '--body', body])
  }
}
