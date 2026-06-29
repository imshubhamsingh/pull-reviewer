import { Maximize2, X } from 'lucide-react'
import { useEffect, useState, type JSX } from 'react'
import { match } from 'ts-pattern'
import { MockupPane } from '@/app/components/mockup-pane'
import { StateDiagramPane } from '@/app/components/state-diagram-pane'
import { MermaidPane } from '@/app/components/mermaid-pane'
import type { JumpSource } from '@/app/components/source-wrap'
import type { CodeRef, Diagram, TourStep } from '@/lib/api'

/**
 * Inline diagram preview rendered below a chat message. Reuses the same
 * `MockupPane` / `StateDiagramPane` / `MermaidPane` the tour uses — so chat
 * answers visualise the same way as walkthroughs. Each preview clamps to
 * ~360px height with a Maximize affordance; click to open the diagram
 * full-screen in `<DiagramExpandModal>`.
 */
interface Props {
  diagram: Diagram
  /** Stable id so the mermaid renderer doesn't collide between bubbles. */
  index: number
  messageId: number
  onJumpRef?: (ref: CodeRef) => void
  /** Called after the MermaidPane auto-fix endpoint returns a repaired source.
   *  Wired to use-chats.patchMermaid so the new source persists in the chat
   *  message row and survives reload. Undefined for non-chat hosts. */
  onRepaired?: (newSource: string) => Promise<void>
}

export function ChatDiagram({
  diagram,
  index,
  messageId,
  onJumpRef,
  onRepaired,
}: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const onJumpSource: JumpSource | undefined = onJumpRef
    ? (ref) => onJumpRef({ file: ref.file, lineStart: ref.lineStart, lineEnd: ref.lineEnd })
    : undefined
  return (
    <div className="border-border bg-surface mt-2 overflow-hidden rounded-md border">
      <div className="border-border bg-surface text-text-muted flex items-center justify-between border-b px-2 py-1 text-[11px] tracking-wider uppercase">
        <span>{kindLabel(diagram)}</span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Expand diagram"
          className="text-text-secondary hover:text-text-primary inline-flex items-center gap-1 transition-colors"
        >
          <Maximize2 size={12} aria-hidden />
          <span>Expand</span>
        </button>
      </div>
      <div className="bg-bg h-[360px]">
        <DiagramRenderer
          diagram={diagram}
          index={index}
          messageId={messageId}
          onJumpSource={onJumpSource}
          onRepaired={onRepaired}
        />
      </div>
      {expanded && (
        <DiagramExpandModal
          diagram={diagram}
          index={index}
          messageId={messageId}
          onJumpSource={onJumpSource}
          onRepaired={onRepaired}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  )
}

function DiagramRenderer({
  diagram,
  index,
  messageId,
  onJumpSource,
  onRepaired,
}: {
  diagram: Diagram
  index: number
  messageId: number
  onJumpSource: JumpSource | undefined
  onRepaired: ((newSource: string) => Promise<void>) | undefined
}): JSX.Element {
  const step = syntheticStep(diagram, index, messageId)
  return match(diagram)
    .with({ kind: 'mockup' }, ({ mockup }) => (
      <MockupPane step={step} scene={mockup} onJumpSource={onJumpSource} />
    ))
    .with({ kind: 'state' }, ({ machine }) => (
      <StateDiagramPane step={step} machine={machine} onJumpSource={onJumpSource} />
    ))
    .otherwise(() => <MermaidPane step={step} onRepaired={onRepaired} />)
}

function DiagramExpandModal({
  diagram,
  index,
  messageId,
  onJumpSource,
  onRepaired,
  onClose,
}: {
  diagram: Diagram
  index: number
  messageId: number
  onJumpSource: JumpSource | undefined
  onRepaired: ((newSource: string) => Promise<void>) | undefined
  onClose: () => void
}): JSX.Element {
  // ESC closes, click on backdrop closes, click inside the dialog ignores.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div
        className="border-border bg-bg flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-lg border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-border bg-surface text-text-secondary flex items-center justify-between border-b px-4 py-2 text-xs tracking-wider uppercase">
          <span>{kindLabel(diagram)}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close expanded diagram"
            className="hover:text-text-primary transition-colors"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <DiagramRenderer
            diagram={diagram}
            index={index}
            messageId={messageId}
            onJumpSource={onJumpSource}
            onRepaired={onRepaired}
          />
        </div>
      </div>
    </div>
  )
}

/** Synthesize a minimal step shape so the existing panes don't need a special
 * "no caption" mode — the empty body makes the figcaption render an empty
 * markdown block, which has no visible height. */
function syntheticStep(diagram: Diagram, index: number, messageId: number): TourStep {
  return {
    id: `chat-${messageId}-d${index}`,
    panel: 'diagram',
    title: '',
    body: '',
    diagram,
  }
}

function kindLabel(diagram: Diagram): string {
  return match(diagram.kind)
    .with('mockup', () => 'Mockup')
    .with('state', () => 'State diagram')
    .with('sequence', () => 'Sequence diagram')
    .with('flowchart', () => 'Flowchart')
    .with('class', () => 'Class diagram')
    .with('er', () => 'ER diagram')
    .with('fileGraph', () => 'File graph')
    .exhaustive()
}
