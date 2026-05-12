import type { Provider } from '@/main/tour/cli-runner.service'
import type { PrContext } from '@/main/tour/pr-context.collector'
import type { TourStep } from '@/main/tour/tour.parser'
import { prId, type TourRecord } from '@/main/tour/tour.store'
import type { TourResult } from '@/main/tour/tour-source'

/** Build a fully-formed record for a freshly-generated tour. */
export function recordFromGeneration(args: {
  ctx: PrContext
  steps: TourStep[]
  previousHeadRefOid: string | null
  provider: Provider
  model: string
}): TourRecord {
  const now = new Date().toISOString()
  return {
    prId: prId(args.ctx.repo, args.ctx.number),
    repo: args.ctx.repo,
    prNumber: args.ctx.number,
    headRefOid: args.ctx.headRefOid,
    baseRefOid: null,             // populated in Phase 3 after PrContextCollector exposes it
    previousHeadRefOid: args.previousHeadRefOid,
    steps: args.steps,
    files: args.ctx.files,
    generatedAt: now,
    lastCheckedAt: now,
    lastAccessedAt: now,
    provider: args.provider,
    model: args.model,
  }
}

/** Project a stored record to a wire-shaped result, attaching the live head sha. */
export function resultFromRecord(rec: TourRecord, currentHeadRefOid: string): TourResult {
  return {
    prNumber: rec.prNumber,
    repo: rec.repo,
    headRefOid: rec.headRefOid,
    baseRefOid: rec.baseRefOid,
    previousHeadRefOid: rec.previousHeadRefOid,
    generatedAt: rec.generatedAt,
    currentHeadRefOid,
    steps: rec.steps,
    files: rec.files,
    provider: rec.provider,
    model: rec.model,
  }
}
