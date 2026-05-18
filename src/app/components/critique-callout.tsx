import { match } from 'ts-pattern'
import type { JSX } from 'react'
import { lensStyle } from '@/app/components/ai-lens-styles'
import { MarkdownView } from '@/app/components/markdown-view'
import type { ChapterCritique, CritiqueIssue, CritiqueSuggestion, Lens } from '@/lib/api'

interface Props {
  critique: ChapterCritique
}

/** Expanded review-feedback card shown below an active chapter when its badge is clicked. */
export function CritiqueCallout({ critique }: Props): JSX.Element {
  if (critique.issues.length === 0 && critique.suggestions.length === 0) return <></>
  return (
    <section className="border-border bg-surface mt-5 space-y-2 rounded-md border p-3">
      <p className="text-text-secondary text-[10px] tracking-wider uppercase">Critique</p>
      {critique.issues.map((issue, i) => (
        <IssueRow key={`i-${i}`} issue={issue} />
      ))}
      {critique.suggestions.map((s, i) => (
        <SuggestionRow key={`s-${i}`} suggestion={s} />
      ))}
    </section>
  )
}

function IssueRow({ issue }: { issue: CritiqueIssue }): JSX.Element {
  return (
    <div className="flex gap-2 text-xs">
      <span className="shrink-0" aria-hidden>
        🚩
      </span>
      <div className="min-w-0 grow">
        <div className="mb-1 text-text-primary">
          <SeverityLabel severity={issue.severity} />
          <LensChip lens={issue.lens} />
        </div>
        <Markdown body={issue.body} />
        <Meta file={issue.code?.file} />
      </div>
    </div>
  )
}

function SuggestionRow({ suggestion }: { suggestion: CritiqueSuggestion }): JSX.Element {
  return (
    <div className="flex gap-2 text-xs">
      <span className="shrink-0" aria-hidden>
        💡
      </span>
      <div className="min-w-0 grow">
        {suggestion.lens && (
          <div className="mb-1">
            <LensChip lens={suggestion.lens} />
          </div>
        )}
        <Markdown body={suggestion.body} />
        <Meta file={suggestion.code?.file} />
      </div>
    </div>
  )
}

function Markdown({ body }: { body: string }): JSX.Element {
  return <MarkdownView body={body} className="text-text-primary" />
}

/**
 * Renders the lens chip when the critique entry was injected by the AI
 * review stitcher. Model-emitted in-tour critique has `lens === undefined`
 * and renders unchanged (no chip).
 */
function LensChip({ lens }: { lens: Lens | undefined }): JSX.Element | null {
  if (!lens) return null
  const style = lensStyle(lens)
  return (
    <span
      className="mr-1 inline-block rounded-sm px-1 py-px text-[10px] font-medium align-middle"
      style={{ background: style.bg, color: style.fg }}
    >
      {style.label}
    </span>
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
