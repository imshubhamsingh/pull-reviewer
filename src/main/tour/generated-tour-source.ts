import type { GitCloneManager } from '@/main/git/clone.manager'
import type { CliRunResult, CliRunnerService, Provider } from '@/main/tour/cli-runner.service'
import type { ModelCatalog } from '@/main/tour/model-catalog'
import type { PrContext, PrContextCollector } from '@/main/tour/pr-context.collector'
import type { PromptBuilder } from '@/main/tour/prompt.builder'
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
    const ctx = await this.collector.collect(opts.prNumber, opts.repo)
    const settings = this.resolveSettings(opts)
    const run = await this.runInWorktree(ctx, settings, opts)
    return this.persist(ctx, run, settings)
  }

  /**
   * Stand up a worktree at the PR head, run the CLI inside it, tear it down.
   * The worktree gives Read/Grep/Glob tools a real filesystem rooted at the
   * PR's head sha — that's how the model gets cross-file context.
   */
  private async runInWorktree(
    ctx: PrContext,
    settings: ResolvedSettings,
    opts: GenerateTourOptions,
  ): Promise<CliRunResult> {
    this.logger.info('Generating tour', {
      prNumber: ctx.number,
      repo: ctx.repo,
      provider: settings.provider,
      model: settings.model,
    })

    const worktree = await this.clones.addWorktree(ctx.repo, ctx.headRefOid)
    try {
      return await this.cli.run({
        prompt: this.promptBuilder.build(ctx),
        provider: settings.provider,
        model: settings.model,
        cwd: worktree,
        signal: settings.signal,
        onEvent: opts.onEvent,
      })
    } finally {
      await this.clones.removeWorktree(worktree).catch((err: Error) => {
        this.logger.warn('Worktree cleanup failed', { worktree, err: err.message })
      })
    }
  }

  private async persist(ctx: PrContext, run: CliRunResult, settings: ResolvedSettings): Promise<TourResult> {
    const chapters = this.parser.parse(run.raw)
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

    const stepCount = chapters.reduce((n, ch) => n + ch.steps.length, 0)
    this.logger.info('Tour generated', {
      prNumber: ctx.number,
      chapterCount: chapters.length,
      stepCount,
      costUsd: run.costUsd,
      durationMs: run.durationMs,
    })
    return resultFromRecord(record, ctx.headRefOid)
  }

  private resolveSettings(opts: GenerateTourOptions): ResolvedSettings {
    const { provider, model } = this.models.resolve({ provider: opts.provider, model: opts.model })
    return {
      provider,
      model,
      signal: opts.signal ?? new AbortController().signal,
    }
  }
}
