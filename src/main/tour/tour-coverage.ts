import type { PrFile } from '@/main/tour/pr-context.collector'
import type { Tour } from '@/main/tour/tour-schema'

/** Files in the diff that no step pins or references. Preserves diff order. */
export function uncoveredFiles(chapters: Tour, files: PrFile[]): string[] {
  const touched = collectTouchedPaths(chapters)
  return files.map((f) => f.path).filter((p) => !touched.has(p))
}

function collectTouchedPaths(chapters: Tour): Set<string> {
  const out = new Set<string>()
  for (const ch of chapters) {
    for (const step of ch.steps) {
      if (step.code?.file) out.add(step.code.file)
      step.references?.forEach((r) => out.add(r.file))
    }
  }
  return out
}

const MAX_LISTED = 30

/** Human-readable retry hint listing missing files with actionable guidance. */
export function coverageRetryHint(missing: string[]): string {
  const head = missing.slice(0, MAX_LISTED).map((p) => `  - ${p}`).join('\n')
  const overflow = missing.length > MAX_LISTED ? `\n  …and ${missing.length - MAX_LISTED} more` : ''
  return [
    `Coverage gap — ${missing.length} file(s) from the diff are not in any step.`,
    `Add each missing file to either \`code.file\` of a step (pinning it) OR to \`references[]\` of any step (mentioning it).`,
    `Tests, lockfiles, generated assets, and config files can be grouped into a single chapter at the end with each file in \`references[]\`.`,
    ``,
    `Missing files:`,
    `${head}${overflow}`,
  ].join('\n')
}
