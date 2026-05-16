import type { GitCloneManager } from '@/main/git/clone.manager'
import type { CliRunResult, CliRunnerService, Provider } from '@/main/tour/cli-runner.service'
import type { ModelCatalog } from '@/main/tour/model-catalog'
import type { PrContext, PrContextCollector } from '@/main/tour/pr-context.collector'
import type { PromptBuilder } from '@/main/tour/prompt.builder'
import { coverageRetryHint, uncoveredFiles } from '@/main/tour/tour-coverage'
import type { Tour } from '@/main/tour/tour-schema'
import type { TourParser } from '@/main/tour/tour.parser'
import { recordFromGeneration, resultFromRecord } from '@/main/tour/tour-mapping'
import type { GenerateTourOptions, TourResult, TourSource } from '@/main/tour/tour-source'
import type { TourStore } from '@/main/tour/tour.store'
import { Service } from '@/main/service'

interface ResolvedSettings {
  provider: Provider
  model: string
  signal: AbortSignal
}

interface ParsedRun {
  run: CliRunResult
  chapters: Tour
}

type AttemptOutcome = { ok: true; value: ParsedRun } | { ok: false; error: Error }

/** How many times to re-run the model after a parse/validation failure. */
const MAX_RETRIES = 2

/** Strategy: runs the LLM inside a worktree at the PR head and persists. Always produces a result. */
export class GeneratedTourSource extends Service implements TourSource {
  constructor(
    private readonly collector: PrContextCollector,
    private readonly promptBuilder: PromptBuilder,
    private readonly cli: CliRunnerService,
    private readonly parser: TourParser,
    private readonly store: TourStore,
    private readonly models: ModelCatalog,
    private readonly clones: GitCloneManager,
  ) {
    super()
  }

  async tryProduce(opts: GenerateTourOptions): Promise<TourResult> {
    opts.onEvent?.({
      type: 'phase',
      name: 'Collecting PR context',
      detail: `${opts.repo} #${opts.prNumber}`,
    })
    const ctx = await this.collector.collect(opts.prNumber, opts.repo)
    const settings = this.resolveSettings(opts)

    const { run, chapters } = await this.generateInsideWorktree(ctx, settings, opts)
    return this.persist(ctx, run, chapters, settings)
  }

  /**
   * Worktree lifecycle wrapper. We do NOT remove the worktree after generation
   * any more — PR-scoped chat reuses it for the same head sha. The orphan
   * sweep in WorktreeManager (24h threshold, runs on app start) handles GC.
   */
  private async generateInsideWorktree(
    ctx: PrContext,
    settings: ResolvedSettings,
    opts: GenerateTourOptions,
  ): Promise<ParsedRun> {
    opts.onEvent?.({
      type: 'phase',
      name: 'Preparing worktree',
      detail: ctx.headRefOid.slice(0, 7),
    })
    const worktree = await this.clones.ensureWorktree(ctx.repo, ctx.headRefOid)
    return this.runWithRetries(ctx, settings, opts, worktree)
  }

  /** Pure retry loop: each iteration delegates to attemptOnce; failures feed into the next prompt. */
  private async runWithRetries(
    ctx: PrContext,
    settings: ResolvedSettings,
    opts: GenerateTourOptions,
    worktree: string,
  ): Promise<ParsedRun> {
    let lastError: Error | undefined
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      this.emitAttemptPhase(opts, attempt, lastError, settings)
      const isFinal = attempt === MAX_RETRIES
      const outcome = await this.attemptOnce(ctx, settings, opts, worktree, lastError, isFinal)
      if (outcome.ok) return outcome.value
      lastError = outcome.error
      this.logger.warn('Tour attempt failed', { attempt, err: lastError.message })
    }
    throw new Error(
      `Tour generation failed after ${MAX_RETRIES + 1} attempts: ${lastError!.message}`,
    )
  }

  /** Run the model once + parse + validate coverage; never throws — wraps failure in `{ ok: false, error }`. */
  private async attemptOnce(
    ctx: PrContext,
    settings: ResolvedSettings,
    opts: GenerateTourOptions,
    worktree: string,
    retryHint: Error | undefined,
    isFinalAttempt: boolean,
  ): Promise<AttemptOutcome> {
    const run = await this.cli.run({
      prompt: this.promptBuilder.build(ctx, retryHint?.message),
      provider: settings.provider,
      model: settings.model,
      cwd: worktree,
      signal: settings.signal,
      onEvent: opts.onEvent,
    })
    opts.onEvent?.({ type: 'phase', name: 'Parsing tour' })
    try {
      const chapters = this.parser.parse(run.raw)
      this.checkCoverage(ctx, chapters, isFinalAttempt)
      return { ok: true, value: { run, chapters } }
    } catch (e) {
      return { ok: false, error: e as Error }
    }
  }

  /** Throws on coverage gap unless this is the final attempt — then logs and accepts. */
  private checkCoverage(ctx: PrContext, chapters: Tour, isFinalAttempt: boolean): void {
    const missing = uncoveredFiles(chapters, ctx.files)
    if (missing.length === 0) return
    if (!isFinalAttempt) throw new Error(coverageRetryHint(missing))
    this.logger.warn('Accepting tour with coverage gap', {
      missingCount: missing.length,
      missingSample: missing.slice(0, 10),
    })
  }

  private emitAttemptPhase(
    opts: GenerateTourOptions,
    attempt: number,
    lastError: Error | undefined,
    _settings: ResolvedSettings,
  ): void {
    if (attempt === 0) return // cli-runner emits "Spawning…" then "Running model"
    opts.onEvent?.({
      type: 'phase',
      name: `Retry ${attempt}/${MAX_RETRIES}`,
      detail: truncate(lastError?.message ?? '', 100),
    })
  }

  private async persist(
    ctx: PrContext,
    run: CliRunResult,
    chapters: Tour,
    settings: ResolvedSettings,
  ): Promise<TourResult> {
    const previous = this.store.get(ctx.repo, ctx.number)
    const record = recordFromGeneration({
      ctx,
      chapters,
      previousHeadRefOid: previous?.headRefOid ?? null,
      provider: settings.provider,
      model: settings.model,
      costUsd: run.costUsd,
      durationMs: run.durationMs,
      usage: run.usage,
    })
    this.store.upsert(record)
    this.logger.info('Tour generated', {
      prNumber: ctx.number,
      chapterCount: chapters.length,
      stepCount: chapters.reduce((n, ch) => n + ch.steps.length, 0),
      costUsd: run.costUsd,
      durationMs: run.durationMs,
    })
    return resultFromRecord(record, ctx.headRefOid)
  }

  private resolveSettings(opts: GenerateTourOptions): ResolvedSettings {
    const { provider, model } = this.models.resolve({ provider: opts.provider, model: opts.model })
    return { provider, model, signal: opts.signal ?? new AbortController().signal }
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
