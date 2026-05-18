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
  /**
   * Optional override for `--allowedTools`. Defaults to the provider's tour
   * preset (Claude → Read,Grep,Glob). Pass e.g. `['WebSearch','WebFetch']` for
   * the Ask-AI flow where the model needs the public web instead of the repo.
   */
  allowedTools?: string[]
}

interface ProviderConfig {
  bin: string
  defaultTools: string[]
  args: (model: string, tools: string[]) => string[]
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
  claude: {
    bin: 'claude',
    defaultTools: ['Read', 'Grep', 'Glob'],
    args: (model, tools) => [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--allowedTools',
      tools.join(','),
      '--model',
      model,
    ],
  },
  codex: {
    bin: 'codex',
    defaultTools: [],
    args: (model) => [
      'exec',
      '-',
      '--json',
      '--sandbox',
      'read-only',
      '--ask-for-approval',
      'never',
      '--model',
      model,
    ],
  },
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
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
      const tools = opts.allowedTools ?? config.defaultTools
      emit({
        type: 'phase',
        name: `Spawning local ${titleCase(opts.provider)} CLI`,
        detail: opts.model,
      })
      const child = spawn(config.bin, config.args(opts.model, tools), {
        cwd: opts.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      child.on('spawn', () => {
        // PID + model in one line makes it easy to grep the logs / Activity
        // Monitor when two CLI streams (tour + review) run in parallel.
        const pidLabel = child.pid != null ? `pid ${child.pid} · ` : ''
        emit({
          type: 'phase',
          name: 'Running model',
          detail: `${pidLabel}${opts.provider} · ${opts.model}`,
        })
        this.logger.info('CLI spawned', { provider: opts.provider, pid: child.pid })
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
