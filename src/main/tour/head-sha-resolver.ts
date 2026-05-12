import type { PrContextCollector } from '@/main/tour/pr-context.collector'
import type { TourRecord, TourStore } from '@/main/tour/tour.store'
import { Service } from '@/main/service'

/**
 * How fresh `last_checked_at` has to be before we trust the cached head sha
 * without re-probing the live PR. Users almost never push faster than this.
 */
const FRESHNESS_WINDOW_MS = 60_000

/** Resolves the live PR head sha, debouncing remote probes via `last_checked_at`. */
export class HeadShaResolver extends Service {
  constructor(
    private readonly collector: PrContextCollector,
    private readonly store: TourStore,
  ) {
    super()
  }

  async resolve(cached: TourRecord): Promise<string> {
    if (this.isFreshEnough(cached.lastCheckedAt)) return cached.headRefOid
    const live = await this.collector.collectHeadSha(cached.prNumber, cached.repo)
    this.store.touchChecked(cached.repo, cached.prNumber)
    return live
  }

  private isFreshEnough(lastCheckedAt: string): boolean {
    return Date.now() - Date.parse(lastCheckedAt) < FRESHNESS_WINDOW_MS
  }
}
