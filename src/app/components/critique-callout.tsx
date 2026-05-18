import { match } from 'ts-pattern'
import type { JSX } from 'react'
import { lensStyle } from '@/app/components/ai-lens-styles'
import { MarkdownView } from '@/app/components/markdown-view'
import type {
  ChapterCritique,
  CodePointer,
  CritiqueIssue,
  CritiqueSuggestion,
  Lens,
} from '@/lib/api'

interface Props {
  critique: ChapterCritique
  /** When the row was injected from an AI finding (carries `findingId`), this
   * makes the file-meta link clickable — same destination as the right-pane
   * Review tab's row click. */
  onJumpToFinding?: (findingId: string, code: CodePointer) => void
}

/** Expanded review-feedback card shown below an active chapter when its badge is clicked. */
export function CritiqueCallout({ critique, onJumpToFinding }: Props): JSX.Element {
  if (critique.issues.length === 0 && critique.suggestions.length === 0) return <></>
  return (
    <section className="border-border bg-surface mt-5 space-y-2 rounded-md border p-3">
      <p className="text-text-secondary text-[11px] tracking-wider uppercase">Critique</p>
      {critique.issues.map((issue, i) => (
        <IssueRow key={`i-${i}`} issue={issue} onJumpToFinding={onJumpToFinding} />
      ))}
      {critique.suggestions.map((s, i) => (
        <SuggestionRow key={`s-${i}`} suggestion={s} onJumpToFinding={onJumpToFinding} />
      ))}
    </section>
  )
}

function IssueRow({
  issue,
  onJumpToFinding,
}: {
  issue: CritiqueIssue
  onJumpToFinding?: (findingId: string, code: CodePointer) => void
}): JSX.Element {
  return (
    <div className="flex gap-2 text-sm">
      <span className="shrink-0" aria-hidden>
        🚩
      </span>
      <div className="min-w-0 grow">
        <div className="mb-1 text-text-primary">
          <SeverityLabel severity={issue.severity} />
          <LensChip lens={issue.lens} />
        </div>
        <Markdown body={issue.body} />
        <Meta code={issue.code} findingId={issue.findingId} onJumpToFinding={onJumpToFinding} />
      </div>
    </div>
  )
}

function SuggestionRow({
  suggestion,
  onJumpToFinding,
}: {
  suggestion: CritiqueSuggestion
  onJumpToFinding?: (findingId: string, code: CodePointer) => void
}): JSX.Element {
  return (
    <div className="flex gap-2 text-sm">
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
        <Meta
          code={suggestion.code}
          findingId={suggestion.findingId}
          onJumpToFinding={onJumpToFinding}
        />
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
      className="mr-1 inline-block rounded-sm px-1.5 py-0.5 text-[11px] font-medium align-middle"
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

function Meta({
  code,
  findingId,
  onJumpToFinding,
}: {
  code: CodePointer | undefined
  findingId: string | undefined
  onJumpToFinding?: (findingId: string, code: CodePointer) => void
}): JSX.Element | null {
  if (!code?.file) return null
  const lineLabel = code.lineStart != null ? `:${code.lineStart}` : ''
  // Only AI-stitched rows carry a findingId (model-emitted in-tour critique
  // doesn't). Without one, no jump destination — render as plain text.
  const clickable = !!(findingId && onJumpToFinding)
  return (
    <p className="text-text-muted mt-1 font-mono text-[11px]">
      {code.file}
      {lineLabel}
      {clickable ? (
        <button
          type="button"
          onClick={() => onJumpToFinding!(findingId!, code)}
          className="text-text-secondary hover:text-text-primary ml-2 underline-offset-2 transition-colors hover:underline"
        >
          [Open in code]
        </button>
      ) : (
        <span className="text-text-muted ml-2">[Comment]</span>
      )}
    </p>
  )
}
