import type { CliEvent, TokenUsage } from '@/main/tour/cli-event'
import type { Provider } from '@/main/tour/cli-runner.service'
import type { PrFile } from '@/main/tour/pr-context.collector'
import type { Tour } from '@/main/tour/tour-schema'

export interface GenerateTourOptions {
  prNumber: number
  repo: string
  provider?: Provider
  model?: string
  signal?: AbortSignal
  /** Structured event stream from the LLM CLI — tool calls, text deltas, final result. */
  onEvent?: (event: CliEvent) => void
  /** If true, bypass the cache and run the model. Else: return cache (even if stale) or run if no cache exists. */
  force?: boolean
}

export interface TourResult {
  prNumber: number
  repo: string
  headRefOid: string
  baseRefOid: string | null
  previousHeadRefOid: string | null
  generatedAt: string
  /** Live PR head sha at the time this result was produced. If !== headRefOid, the tour is stale. */
  currentHeadRefOid: string
  chapters: Tour
  files: PrFile[]
  provider: string
  model: string
  /** Total cost reported by the provider for the generation run (USD). null if unknown. */
  costUsd: number | null
  /** Wall-clock time the model took, in ms. null if unknown. */
  durationMs: number | null
  /** Raw token counts as reported by the provider. */
  usage: TokenUsage | null
}

/**
 * Strategy interface — one path that may produce a tour result for the given options.
 * Returning `undefined` means "this source has nothing; try the next one."
 */
export interface TourSource {
  tryProduce(opts: GenerateTourOptions): Promise<TourResult | undefined>
}
