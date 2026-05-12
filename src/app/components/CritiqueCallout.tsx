import { match } from 'ts-pattern'
import type { JSX } from 'react'
import type { ChapterCritique, CritiqueIssue, CritiqueSuggestion } from '@/lib/api'

interface Props {
  critique: ChapterCritique
}

/** Expanded review-feedback card shown below an active chapter when its badge is clicked. */
export function CritiqueCallout({ critique }: Props): JSX.Element {
  return (
    <div className="border-border bg-surface mx-4 mb-3 space-y-2 rounded-md border p-3">
      <p className="text-text-secondary text-[10px] tracking-wider uppercase">Critique</p>
      {critique.issues.map((issue, i) => <IssueRow key={`i-${i}`} issue={issue} />)}
      {critique.suggestions.map((s, i) => <SuggestionRow key={`s-${i}`} suggestion={s} />)}
    </div>
  )
}

function IssueRow({ issue }: { issue: CritiqueIssue }): JSX.Element {
  return (
    <div className="flex gap-2 text-xs">
      <span className="shrink-0" aria-hidden>🚩</span>
      <div className="grow">
        <p className="text-text-primary">
          <SeverityLabel severity={issue.severity} /> {issue.body}
        </p>
        <Meta file={issue.code?.file} />
      </div>
    </div>
  )
}

function SuggestionRow({ suggestion }: { suggestion: CritiqueSuggestion }): JSX.Element {
  return (
    <div className="flex gap-2 text-xs">
      <span className="shrink-0" aria-hidden>💡</span>
      <div className="grow">
        <p className="text-text-primary">{suggestion.body}</p>
        <Meta file={suggestion.code?.file} />
      </div>
    </div>
  )
}

function SeverityLabel({ severity }: { severity: CritiqueIssue['severity'] }): JSX.Element {
  const color = match(severity)
    .with('blocker', () => 'text-text-danger')
    .with('major', () => 'text-text-brand')
    .with('minor', () => 'text-text-secondary')
    .exhaustive()
  return <span className={`${color} mr-1 font-medium`}>{severity}</span>
}

function Meta({ file }: { file?: string }): JSX.Element | null {
  if (!file) return null
  return (
    <p className="text-text-muted mt-0.5 font-mono text-[10px]">
      {file} <span className="text-text-muted ml-2">[Comment]</span>
    </p>
  )
}
