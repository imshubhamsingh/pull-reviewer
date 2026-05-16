import * as os from 'node:os'
import askTemplate from '@/main/explain/prompts/ask.md?raw'
import { template } from '@/main/lib/template'
import type { CliEvent } from '@/main/tour/cli-event'
import type { CliRunnerService } from '@/main/tour/cli-runner.service'
import type { FileSnapshotService } from '@/main/files/file-snapshot.service'
import type { QaThreadRecord, QaThreadStore } from '@/main/explain/qa.store'
import { Service } from '@/main/service'

export interface ExplainInput {
  repo: string
  prNumber: number
  sha: string
  file: string
  /** Inclusive 1-based start line of the snippet to explain. */
  startLine: number
  /** Inclusive 1-based end line; equal to startLine for single-line. */
  endLine: number
  /** Reviewer's question, free text. */
  question: string
  /** Optional model override; defaults to the catalog's default. */
  model?: string
  signal?: AbortSignal
  /** Live event stream — tool calls, text deltas, final raw — for streaming UIs. */
  onEvent?: (event: CliEvent) => void
}

export interface ExplainResult {
  thread: QaThreadRecord
}

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929'
const CONTEXT_LINES = 6
const ASK_TOOLS = ['WebSearch', 'WebFetch']
const ASK_RETRIES = 2
const RETRY_BACKOFF_MS = 750

/**
 * Runs claude with web tools enabled to answer a reviewer's question about a
 * code excerpt, then persists the Q&A thread. The CLI spawns in stream-json
 * mode so tool calls and text deltas flow back through `onEvent` for a live
 * activity UI — same shape as tour generation.
 */
export class ExplainService extends Service {
  constructor(
    private readonly files: FileSnapshotService,
    private readonly threads: QaThreadStore,
    private readonly cli: CliRunnerService,
  ) {
    super()
  }

  list(repo: string, prNumber: number): QaThreadRecord[] {
    return this.threads.list(repo, prNumber)
  }

  async ask(input: ExplainInput): Promise<ExplainResult> {
    const snap = await this.files.get(input.repo, input.sha, input.file)
    if (snap.encoding !== 'utf8' || !snap.content) {
      throw new Error(`Cannot explain a non-utf8 file (${snap.encoding})`)
    }
    const prompt = buildPrompt({
      file: input.file,
      content: snap.content,
      startLine: input.startLine,
      endLine: input.endLine,
      question: input.question,
    })
    const model = input.model ?? DEFAULT_MODEL
    const signal = input.signal ?? new AbortController().signal
    this.logger.info('Asking AI', {
      repo: input.repo,
      prNumber: input.prNumber,
      file: input.file,
      lines: `${input.startLine}-${input.endLine}`,
      qBytes: input.question.length,
    })

    const raw = await withRetry(
      () =>
        this.cli
          .run({
            prompt,
            provider: 'claude',
            model,
            cwd: os.tmpdir(), // no worktree needed; web tools only
            signal,
            allowedTools: ASK_TOOLS,
            onEvent: input.onEvent,
          })
          .then((r) => r.raw),
      ASK_RETRIES,
      signal,
      (attempt, err) => this.logger.warn('Ask AI retry', { attempt, err: err.message }),
    )

    const answer = raw.trim()
    if (!answer) throw new Error('AI returned an empty answer')

    const thread = this.threads.create({
      repo: input.repo,
      prNumber: input.prNumber,
      file: input.file,
      startLine: input.startLine,
      endLine: input.endLine,
      question: input.question,
      answer,
      model,
    })
    return { thread }
  }

  remove(id: number): boolean {
    return this.threads.remove(id)
  }
}

interface PromptArgs {
  file: string
  content: string
  startLine: number
  endLine: number
  question: string
}

function buildPrompt({ file, content, startLine, endLine, question }: PromptArgs): string {
  const window = renderWindow(content, startLine, endLine)
  return template(askTemplate, { file, startLine, endLine, window, question })
}

function renderWindow(content: string, startLine: number, endLine: number): string {
  const lines = content.split('\n')
  const lo = Math.max(1, startLine - CONTEXT_LINES)
  const hi = Math.min(lines.length, endLine + CONTEXT_LINES)
  return lines
    .slice(lo - 1, hi)
    .map((line, i) => formatWindowLine(line, lo + i, startLine, endLine))
    .join('\n')
}

function formatWindowLine(
  line: string,
  lineNum: number,
  startLine: number,
  endLine: number,
): string {
  const marker = lineNum >= startLine && lineNum <= endLine ? '►' : ' '
  return `${marker} ${String(lineNum).padStart(4)}: ${line}`
}

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts: number,
  signal: AbortSignal | undefined,
  onRetry?: (attempt: number, err: Error) => void,
): Promise<T> {
  let lastError: Error | undefined
  for (let i = 0; i <= attempts; i++) {
    if (signal?.aborted) throw new Error('Aborted')
    try {
      return await fn()
    } catch (e) {
      lastError = e as Error
      if (i === attempts) throw lastError
      onRetry?.(i + 1, lastError)
      await sleep(RETRY_BACKOFF_MS * (i + 1))
    }
  }
  throw lastError ?? new Error('unreachable')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
