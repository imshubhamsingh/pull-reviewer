import type { HeadShaResolver } from '@/main/tour/head-sha-resolver'
import type { TourStore } from '@/main/tour/tour.store'
import { resultFromRecord } from '@/main/tour/tour-mapping'
import type { GenerateTourOptions, TourResult, TourSource } from '@/main/tour/tour-source'
import { Service } from '@/main/service'

/** Strategy: returns the cached tour (possibly stale). Never runs the model. */
export class CachedTourSource extends Service implements TourSource {
  constructor(
    private readonly store: TourStore,
    private readonly liveHead: HeadShaResolver,
  ) {
    super()
  }

  async tryProduce(opts: GenerateTourOptions): Promise<TourResult | undefined> {
    const cached = this.store.get(opts.repo, opts.prNumber)
    if (!cached) return undefined

    const currentHeadRefOid = await this.liveHead.resolve(cached)
    this.logger.info('Tour cache hit', {
      repo: opts.repo,
      prNumber: opts.prNumber,
      stale: currentHeadRefOid !== cached.headRefOid,
    })
    return resultFromRecord(cached, currentHeadRefOid)
  }
}
