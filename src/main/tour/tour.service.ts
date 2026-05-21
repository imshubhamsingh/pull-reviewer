import type { CachedTourSource } from '@/main/tour/cached-tour-source'
import type { GeneratedTourSource } from '@/main/tour/generated-tour-source'
import { resultFromRecord } from '@/main/tour/tour-mapping'
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

  /**
   * Returns ANY stored tour for this PR — including ones generated against an
   * older `CURRENT_SCHEMA_VERSION`. Surfaced as an explicit snapshot ("View
   * previous tour") so a schema-version bump doesn't visibly orphan work.
   * The stored `headRefOid` doubles as `currentHeadRefOid` — the staleness
   * banner stays off because the user opted into the snapshot.
   */
  getStale(repo: string, prNumber: number): TourResult | undefined {
    const rec = this.store.getAny(repo, prNumber)
    if (!rec) return undefined
    return resultFromRecord(rec, rec.headRefOid)
  }

  async generate(opts: GenerateTourOptions): Promise<TourResult> {
    if (!opts.force) {
      const hit = await this.cached.tryProduce(opts)
      if (hit) return hit
    }
    return this.generated.tryProduce(opts) as Promise<TourResult>
  }
}
