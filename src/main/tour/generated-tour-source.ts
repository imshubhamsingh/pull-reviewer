import type { CliRunnerService, Provider } from '@/main/tour/cli-runner.service'
import type { ModelCatalog } from '@/main/tour/model-catalog'
import type { PrContextCollector } from '@/main/tour/pr-context.collector'
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

/** Strategy: runs the LLM and persists. Always produces a result. */
export class GeneratedTourSource extends Service implements TourSource {
  constructor(
    private readonly collector: PrContextCollector,
    private readonly promptBuilder: PromptBuilder,
    private readonly cli: CliRunnerService,
    private readonly parser: TourParser,
    private readonly store: TourStore,
    private readonly models: ModelCatalog,
  ) {
    super()
  }

  async tryProduce(opts: GenerateTourOptions): Promise<TourResult> {
    const ctx = await this.collector.collect(opts.prNumber, opts.repo)
    const settings = this.resolveSettings(opts)

    this.logger.info('Generating tour', {
      prNumber: opts.prNumber,
      repo: opts.repo,
      provider: settings.provider,
      model: settings.model,
    })

    const raw = await this.cli.run({
      prompt: this.promptBuilder.build(ctx),
      provider: settings.provider,
      model: settings.model,
      signal: settings.signal,
      onProgress: opts.onProgress,
    })

    const chapters = this.parser.parse(raw)
    const previous = this.store.get(opts.repo, opts.prNumber)
    const record = recordFromGeneration({
      ctx,
      chapters,
      previousHeadRefOid: previous?.headRefOid ?? null,
      provider: settings.provider,
      model: settings.model,
    })
    this.store.upsert(record)

    const stepCount = chapters.reduce((n, ch) => n + ch.steps.length, 0)
    this.logger.info('Tour generated', { prNumber: opts.prNumber, chapterCount: chapters.length, stepCount })
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
