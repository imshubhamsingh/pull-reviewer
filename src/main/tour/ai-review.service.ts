import { app } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { CliEvent } from '@/main/tour/cli-event'
import type { CliRunnerService, Provider } from '@/main/tour/cli-runner.service'
import type { PrContext } from '@/main/tour/pr-context.collector'
import type { Review } from '@/main/tour/review-schema'
import type { AiReviewParser } from '@/main/tour/ai-review.parser'
import type { AiReviewPromptBuilder } from '@/main/tour/ai-review-prompt.builder'
import type { Tour } from '@/main/tour/tour-schema'
import { Service } from '@/main/service'

export interface GenerateReviewOptions {
  ctx: PrContext
  tour: Tour | null
  provider: Provider
  model: string
  cwd: string
  signal: AbortSignal
  onEvent?: (event: CliEvent) => void
}

/**
 * Runs the AI review pass. Tolerant: returns `null` rather than throwing,
 * so the tour still ships when review fails. Two safeguards added after
 * a $1.44 run was thrown away due to a single malformed-JSON character:
 *
 *  1. **Raw output is dumped to `userData/failed-reviews/<sha>.txt`** when
 *     parsing fails — the user can recover the analysis manually.
 *  2. **One retry** with the parse-error as a hint — the model usually
 *     fixes its own JSON when shown the exact column.
 *
 * Every CLI event is tagged with `stream: 'review'` so the two-column
 * generating panel can fan it into the right side.
 */
export class AiReviewService extends Service {
  constructor(
    private readonly promptBuilder: AiReviewPromptBuilder,
    private readonly cli: CliRunnerService,
    private readonly parser: AiReviewParser,
  ) {
    super()
  }

  async generate(opts: GenerateReviewOptions): Promise<Review | null> {
    const tagged = (e: CliEvent): void => opts.onEvent?.({ ...e, stream: 'review' })
    tagged({ type: 'phase', name: 'Triaging lenses' })

    // First attempt — vanilla.
    const first = await this.attempt(opts, tagged, undefined)
    if (first.review) return first.review
    if (!first.raw) return null

    // Parse failed but we have raw output. Save it (so the cost isn't lost)
    // and retry once with the parser error as a corrective hint.
    this.saveRaw(opts.ctx.headRefOid, first.raw, first.error)
    this.logger.warn('Retrying review pass with parse-error hint', {
      err: first.error?.message,
    })
    tagged({ type: 'phase', name: 'Retrying review (fixing JSON)' })

    const second = await this.attempt(opts, tagged, first.error ?? undefined)
    if (second.review) return second.review
    if (second.raw) this.saveRaw(opts.ctx.headRefOid, second.raw, second.error, 'retry')
    return null
  }

  private async attempt(
    opts: GenerateReviewOptions,
    tagged: (e: CliEvent) => void,
    retryHint: Error | undefined,
  ): Promise<{ review: Review | null; raw: string | null; error: Error | null }> {
    const prompt = this.buildPrompt(opts, retryHint)
    let raw: string | null = null
    try {
      const run = await this.cli.run({
        prompt,
        provider: opts.provider,
        model: opts.model,
        cwd: opts.cwd,
        signal: opts.signal,
        onEvent: tagged,
      })
      raw = run.raw
      const review = this.parser.parse(run.raw)
      this.logger.info('AI review parsed', {
        lensesApplied: review.lensesApplied.length,
        findings: review.findings.length,
      })
      return { review, raw, error: null }
    } catch (err) {
      this.logger.warn('AI review attempt failed', { err: (err as Error).message })
      return { review: null, raw, error: err as Error }
    }
  }

  private buildPrompt(opts: GenerateReviewOptions, retryHint: Error | undefined): string {
    const base = this.promptBuilder.build(opts.ctx, opts.tour)
    if (!retryHint) return base
    return `${base}\n\n# Retry notice\n\nYour previous output failed JSON parsing with: \`${retryHint.message}\`.\n\nRe-emit your response. The JSON object MUST be syntactically valid — common pitfalls: unescaped quotes inside string values, trailing commas, missing commas between properties. Output ONLY the triage paragraph followed by the JSON object; no extra prose.`
  }

  /**
   * Dump the raw CLI output to `userData/failed-reviews/<sha>[-retry].txt`
   * so the analysis isn't lost when JSON parsing fails. The user can read
   * it manually and salvage findings.
   */
  private saveRaw(headRefOid: string, raw: string, error: Error | null, suffix = ''): void {
    try {
      const dir = path.join(app.getPath('userData'), 'failed-reviews')
      mkdirSync(dir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const name = `${stamp}__${headRefOid.slice(0, 7)}${suffix ? '-' + suffix : ''}.txt`
      const file = path.join(dir, name)
      const header = `# AI review parse failure\n# headRefOid: ${headRefOid}\n# error: ${error?.message ?? '(unknown)'}\n# ----------\n\n`
      writeFileSync(file, header + raw, 'utf8')
      this.logger.warn('Saved failed review raw output for manual recovery', { file })
    } catch (err) {
      this.logger.error('Could not save failed review raw', { err: (err as Error).message })
    }
  }
}
