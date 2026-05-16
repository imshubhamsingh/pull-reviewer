import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Service } from '@/main/service'

const exec = promisify(execFile)
const MAX_BUFFER = 64 * 1024 * 1024

export interface GitRunOptions {
  cwd?: string
  /** Return raw stdout as a Buffer instead of a UTF-8 string. */
  asBuffer?: boolean
}

/**
 * Thin async wrapper over `git`. Centralised so we control buffer size,
 * encoding, and error shape in one place — and so individual clone helpers
 * stay focused on their git verbs.
 */
export class GitRunner extends Service {
  async run(args: string[], opts: GitRunOptions = {}): Promise<string> {
    this.logger.info('git', { args, cwd: opts.cwd })
    const { stdout } = await exec('git', args, { cwd: opts.cwd, maxBuffer: MAX_BUFFER })
    return stdout
  }

  async runBuffer(args: string[], opts: GitRunOptions = {}): Promise<Buffer> {
    this.logger.info('git', { args, cwd: opts.cwd, encoding: 'buffer' })
    const { stdout } = await exec('git', args, {
      cwd: opts.cwd,
      maxBuffer: MAX_BUFFER,
      encoding: 'buffer',
    })
    return stdout as unknown as Buffer
  }

  /** Run a command that may legitimately fail — returns true iff exit 0. */
  async ok(args: string[], opts: GitRunOptions = {}): Promise<boolean> {
    try {
      await exec('git', args, { cwd: opts.cwd, maxBuffer: MAX_BUFFER })
      return true
    } catch {
      return false
    }
  }
}
