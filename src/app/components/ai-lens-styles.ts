import type { Lens } from '@/lib/api'

/**
 * Per-lens visual palette. Restrained: just an accent color used for the
 * lens chip background and a matching label. Severity colors live in
 * critique-callout.tsx today; we reuse those for the severity pill so
 * the visual rhythm stays consistent.
 */

export interface LensStyle {
  /** Hex / hsl token used as a low-saturation chip background. */
  bg: string
  /** Foreground (text) color paired with `bg`. */
  fg: string
  /** Human-readable short label for the chip and tooltips. */
  label: string
}

const STYLES: Record<Lens, LensStyle> = {
  'code-quality': { bg: 'hsl(220 30% 22%)', fg: 'hsl(220 60% 80%)', label: 'Code quality' },
  'business-logic': { bg: 'hsl(170 30% 20%)', fg: 'hsl(170 60% 78%)', label: 'Business logic' },
  'data-integrity': { bg: 'hsl(200 30% 20%)', fg: 'hsl(200 60% 80%)', label: 'Data integrity' },
  'api-contracts': { bg: 'hsl(280 30% 22%)', fg: 'hsl(280 60% 82%)', label: 'API contracts' },
  'performance-security': { bg: 'hsl(0 35% 22%)', fg: 'hsl(0 70% 82%)', label: 'Perf / Security' },
  observability: { bg: 'hsl(40 30% 22%)', fg: 'hsl(40 75% 78%)', label: 'Observability' },
  migration: { bg: 'hsl(260 30% 22%)', fg: 'hsl(260 60% 82%)', label: 'Migration' },
  'design-system': { bg: 'hsl(320 30% 22%)', fg: 'hsl(320 60% 82%)', label: 'Design system' },
  'ux-dx': { bg: 'hsl(140 30% 20%)', fg: 'hsl(140 60% 78%)', label: 'UX / DX' },
}

export function lensStyle(lens: Lens): LensStyle {
  return STYLES[lens]
}

export interface SeverityStyle {
  bg: string
  fg: string
  label: string
}

const SEVERITY_STYLES: Record<'blocker' | 'major' | 'minor', SeverityStyle> = {
  blocker: { bg: 'hsl(0 60% 25%)', fg: 'hsl(0 80% 88%)', label: 'Blocker' },
  major: { bg: 'hsl(35 55% 25%)', fg: 'hsl(35 80% 85%)', label: 'Major' },
  minor: { bg: 'hsl(220 10% 22%)', fg: 'hsl(220 15% 78%)', label: 'Minor' },
}

export function severityStyle(severity: 'blocker' | 'major' | 'minor'): SeverityStyle {
  return SEVERITY_STYLES[severity]
}
