import { match } from 'ts-pattern'
import type { Finding, FindingDiagram } from '@/lib/api'

/**
 * Resolves a finding's diagrams. New emissions populate `diagrams[]` directly;
 * legacy stored reviews only have the single `mermaid` field — wrap it as one
 * `sequence` diagram so the renderer treats both shapes uniformly.
 */
export function diagramsForFinding(finding: Finding): FindingDiagram[] {
  if (finding.diagrams && finding.diagrams.length > 0) return finding.diagrams
  if (finding.mermaid) return [{ kind: 'sequence', mermaid: finding.mermaid }]
  return []
}

/** Human-readable caption for the diagram kind, shown above each diagram. */
export function captionForDiagram(diagram: FindingDiagram): string {
  return match(diagram.kind)
    .with('sequence', () => 'Sequence diagram')
    .with('flowchart', () => 'Flowchart')
    .with('er', () => 'Entity-relationship diagram')
    .with('class', () => 'Class diagram')
    .with('fileGraph', () => 'File graph')
    .exhaustive()
}
