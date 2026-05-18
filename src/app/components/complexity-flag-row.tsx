import { type JSX } from 'react'
import { match } from 'ts-pattern'
import { MarkdownView } from '@/app/components/markdown-view'
import type { ComplexityFlag } from '@/lib/api'

/**
 * One badge-above-text row inside the PR-shape callout. Severity drives the
 * badge palette; body/suggestion render through MarkdownView so inline code
 * and links stay live.
 */
export function ComplexityFlagRow({ flag }: { flag: ComplexityFlag }): JSX.Element {
  const sev = match(flag.severity)
    .with('blocker', () => ({ bg: 'rgba(239, 68, 68, 0.16)', fg: 'rgb(251, 113, 133)' }))
    .with('major', () => ({ bg: 'rgba(251, 191, 36, 0.16)', fg: 'rgb(252, 211, 77)' }))
    .with('minor', () => ({ bg: 'rgba(148, 163, 184, 0.18)', fg: 'rgb(203, 213, 225)' }))
    .exhaustive()
  return (
    <li>
      <span
        className="inline-block rounded-sm px-1.5 py-0.5 text-[9px] font-medium tracking-wider uppercase"
        style={{ backgroundColor: sev.bg, color: sev.fg }}
      >
        {KIND_LABEL[flag.kind]}
      </span>
      <MarkdownView body={flag.body} className="text-text-primary mt-1 text-xs leading-relaxed" />
      {flag.suggestion && (
        <MarkdownView
          body={`**Suggestion:** ${flag.suggestion}`}
          className="text-text-secondary mt-0.5 text-[11px] leading-relaxed"
        />
      )}
      {flag.code?.file && (
        <p className="text-text-muted mt-0.5 font-mono text-[10px]">
          {flag.code.file}
          {flag.code.lineStart != null ? `:${flag.code.lineStart}` : ''}
        </p>
      )}
    </li>
  )
}

const KIND_LABEL: Record<ComplexityFlag['kind'], string> = {
  cyclomatic: 'Cyclomatic',
  'file-length': 'File length',
  'function-length': 'Function length',
  nesting: 'Nesting',
  churn: 'Churn',
  pattern: 'Pattern',
  duplication: 'Duplication',
}
