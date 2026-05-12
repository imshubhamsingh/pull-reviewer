import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Service } from '@/main/service'

const exec = promisify(execFile)

export class AuthService extends Service {
  private cached: string | undefined

  async getToken(): Promise<string> {
    if (this.cached) return this.cached
    this.logger.info('Reading token from gh CLI')
    try {
      const { stdout } = await exec('gh', ['auth', 'token'])
      const token = stdout.trim()
      if (!token) throw new Error('gh auth token returned empty output')
      this.cached = token
      return token
    } catch (err) {
      this.logger.error('Failed to read gh token', { err: (err as Error).message })
      throw new Error('Could not read GitHub token. Run: gh auth login')
    }
  }

  clear(): void {
    this.cached = undefined
  }
}
