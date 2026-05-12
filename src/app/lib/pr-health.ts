/**
 * PR-cycle health bands. Mirrors the Elite / Good / Fair / Needs Focus
 * categorisation common in DORA-style dashboards. Thresholds are hours.
 *
 * For open PRs the only stage we can directly observe is **pickup** — time
 * since the PR was opened with no review yet. Once GitHub returns the
 * viewer's latestReview timestamp we can extend this to per-stage badges
 * (review, merge).
 */
export type HealthBand = 'elite' | 'good' | 'fair' | 'focus'

export interface BandSpec {
  elite: number
  good: number
  fair: number
}

export const PICKUP_BANDS: BandSpec = { elite: 2, good: 6, fair: 16 }
export const REVIEW_BANDS: BandSpec = { elite: 5, good: 18, fair: 26 }
export const MERGE_BANDS:  BandSpec = { elite: 2, good: 5, fair: 19 }

export function classify(hours: number, bands: BandSpec): HealthBand {
  if (hours < bands.elite) return 'elite'
  if (hours < bands.good)  return 'good'
  if (hours < bands.fair)  return 'fair'
  return 'focus'
}

export function hoursBetween(fromIso: string, to: number = Date.now()): number {
  const t = Date.parse(fromIso)
  if (!Number.isFinite(t)) return 0
  return Math.max(0, (to - t) / 3_600_000)
}

/** Compact "1d 7h" / "5.2h" / "12m" formatter for badge bodies. */
export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.floor(hours * 60)}m`
  if (hours < 24) return `${hours.toFixed(1)}h`
  const days = Math.floor(hours / 24)
  const rem = Math.round(hours - days * 24)
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`
}
