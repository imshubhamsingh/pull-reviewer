import type { CachedTourSource } from '@/main/tour/cached-tour-source'
import type { GeneratedTourSource } from '@/main/tour/generated-tour-source'
import type { GenerateTourOptions, TourResult } from '@/main/tour/tour-source'
import type { TourRecord, TourStore } from '@/main/tour/tour.store'
import { Service } from '@/main/service'

export type { GenerateTourOptions, TourResult } from '@/main/tour/tour-source'

/**
 * Picks between cache and model-run. Chain-of-Responsibility:
 *  - if !force: try the cached source first; if it has a hit, return it.
 *  - else (or if cache miss): always run the model.
 */
export class TourService extends Service {
  constructor(
    private readonly cached: CachedTourSource,
    private readonly generated: GeneratedTourSource,
    private readonly store: TourStore,
  ) {
    super()
  }

  /** Returns the cached record for this PR, or undefined. Pure read — no head-sha probe. */
  get(repo: string, prNumber: number): TourRecord | undefined {
    return this.store.get(repo, prNumber)
  }

  async generate(opts: GenerateTourOptions): Promise<TourResult> {
    if (!opts.force) {
      const hit = await this.cached.tryProduce(opts)
      if (hit) return hit
    }
    return this.generated.tryProduce(opts) as Promise<TourResult>
  }
}
