import type { TokenUsage } from '@/main/tour/cli-event'
import type { Provider } from '@/main/tour/cli-runner.service'
import type { PrContext } from '@/main/tour/pr-context.collector'
import type { Tour } from '@/main/tour/tour-schema'
import { prId, type TourRecord } from '@/main/tour/tour.store'
import type { TourResult } from '@/main/tour/tour-source'

/** Build a fully-formed record for a freshly-generated tour. */
export function recordFromGeneration(args: {
  ctx: PrContext
  chapters: Tour
  previousHeadRefOid: string | null
  provider: Provider
  model: string
  costUsd?: number
  durationMs?: number
  usage?: TokenUsage
}): TourRecord {
  const now = new Date().toISOString()
  return {
    prId: prId(args.ctx.repo, args.ctx.number),
    repo: args.ctx.repo,
    prNumber: args.ctx.number,
    headRefOid: args.ctx.headRefOid,
    baseRefOid: null, // populated when PrContextCollector exposes baseRefOid (later phase)
    previousHeadRefOid: args.previousHeadRefOid,
    chapters: args.chapters,
    files: args.ctx.files,
    generatedAt: now,
    lastCheckedAt: now,
    lastAccessedAt: now,
    provider: args.provider,
    model: args.model,
    costUsd: args.costUsd ?? null,
    durationMs: args.durationMs ?? null,
    usage: args.usage ?? null,
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
    chapters: rec.chapters,
    files: rec.files,
    provider: rec.provider,
    model: rec.model,
    costUsd: rec.costUsd,
    durationMs: rec.durationMs,
    usage: rec.usage,
  }
}
