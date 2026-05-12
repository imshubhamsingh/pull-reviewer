import { spawn } from 'node:child_process'
import { Service } from '@/main/service'

export type Provider = 'claude' | 'codex'

export interface CliRunOptions {
  prompt: string
  provider: Provider
  model: string
  signal: AbortSignal
  onProgress?: (chunk: string) => void
}

interface ProviderConfig {
  bin: string
  args: (model: string) => string[]
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
  claude: {
    bin: 'claude',
    args: (model) => ['-p', '--output-format', 'json', '--allowedTools', '', '--model', model],
  },
  codex: {
    bin: 'codex',
    args: (model) => [
      'exec', '-',
      '--json',
      '--sandbox', 'read-only',
      '--ask-for-approval', 'never',
      '--model', model,
    ],
  },
}

export class CliRunnerService extends Service {
  run(opts: CliRunOptions): Promise<string> {
    const config = PROVIDERS[opts.provider]
    this.logger.info('Spawning CLI', {
      provider: opts.provider,
      model: opts.model,
      promptBytes: opts.prompt.length,
    })

    return new Promise((resolve, reject) => {
      const child = spawn(config.bin, config.args(opts.model), {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''

      const onAbort = () => child.kill('SIGTERM')
      opts.signal.addEventListener('abort', onAbort, { once: true })

      child.stdout.on('data', (chunk: Buffer) => {
        const s = chunk.toString()
        stdout += s
        opts.onProgress?.(s)
      })

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      child.on('error', (err) => {
        opts.signal.removeEventListener('abort', onAbort)
        this.logger.error('CLI spawn failed', {
          provider: opts.provider,
          err: err.message,
        })
        reject(err)
      })

      child.on('close', (code) => {
        opts.signal.removeEventListener('abort', onAbort)
        if (code !== 0) {
          this.logger.error('CLI exited non-zero', {
            provider: opts.provider,
            code,
            stderrPreview: stderr.slice(0, 500),
          })
          reject(new Error(`${config.bin} exited ${code}: ${stderr.trim()}`))
          return
        }
        this.logger.info('CLI finished', {
          provider: opts.provider,
          stdoutBytes: stdout.length,
        })
        resolve(stdout)
      })

      child.stdin.end(opts.prompt)
    })
  }
}
