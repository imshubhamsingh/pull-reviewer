import { spawn } from 'node:child_process'
import { Service } from '@/main/service'
import type { CliEvent, TokenUsage } from '@/main/tour/cli-event'
import { CliStreamParser } from '@/main/tour/cli-stream-parser'

export type Provider = 'claude' | 'codex'

export interface CliRunResult {
  raw: string
  costUsd?: number
  durationMs?: number
  usage?: TokenUsage
}

export interface CliRunOptions {
  prompt: string
  provider: Provider
  model: string
  /** Working directory for the spawned CLI — usually a worktree at the PR's head sha. */
  cwd: string
  signal: AbortSignal
  /** Structured event stream — tool calls, text deltas, final result. */
  onEvent?: (event: CliEvent) => void
  /** Legacy raw-chunk callback, kept for non-streaming paths. */
  onProgress?: (chunk: string) => void
}

interface ProviderConfig {
  bin: string
  args: (model: string) => string[]
}

/**
 * Claude runs with `--allowedTools 'Read,Grep,Glob'` so the model can read
 * neighbouring code in the worktree (cross-file context, callers, types).
 * Codex stays single-shot for now — same `--sandbox read-only` posture.
 */
const PROVIDERS: Record<Provider, ProviderConfig> = {
  claude: {
    bin: 'claude',
    args: (model) => [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--allowedTools', 'Read,Grep,Glob',
      '--model', model,
    ],
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
  run(opts: CliRunOptions): Promise<CliRunResult> {
    const config = PROVIDERS[opts.provider]
    this.logger.info('Spawning CLI', {
      provider: opts.provider,
      model: opts.model,
      cwd: opts.cwd,
      promptBytes: opts.prompt.length,
    })

    const parser = new CliStreamParser()
    const emit = (event: CliEvent) => opts.onEvent?.(event)

    return new Promise((resolve, reject) => {
      const child = spawn(config.bin, config.args(opts.model), {
        cwd: opts.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stderr = ''
      const onAbort = () => child.kill('SIGTERM')
      opts.signal.addEventListener('abort', onAbort, { once: true })

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        opts.onProgress?.(text)
        parser.feed(text, emit)
      })

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      child.on('error', (err) => {
        opts.signal.removeEventListener('abort', onAbort)
        this.logger.error('CLI spawn failed', { provider: opts.provider, err: err.message })
        reject(err)
      })

      child.on('close', (code) => {
        opts.signal.removeEventListener('abort', onAbort)
        parser.flush(emit)
        const raw = parser.finalText()
        const meta = parser.meta()

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
          rawBytes: raw.length,
          costUsd: meta.costUsd,
          durationMs: meta.durationMs,
        })
        emit({ type: 'final', raw, ...meta })
        resolve({ raw, ...meta })
      })

      child.stdin.end(opts.prompt)
    })
  }
}
