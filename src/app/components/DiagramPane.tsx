import { useEffect, useMemo, useState, type JSX } from 'react'
import mermaid from 'mermaid'
import { marked } from 'marked'
import type { TourStep } from '@/lib/api'

mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict', fontFamily: 'inherit' })

interface Props {
  step: TourStep
}

type RenderState =
  | { kind: 'idle' }
  | { kind: 'ok'; svg: string }
  | { kind: 'error'; message: string }

export function DiagramPane({ step }: Props): JSX.Element {
  const [state, setState] = useState<RenderState>({ kind: 'idle' })
  const id = `mermaid-${step.id}`

  useEffect(() => {
    let cancelled = false
    if (!step.diagram) { setState({ kind: 'error', message: 'No mermaid source on this step.' }); return }
    mermaid.render(id, step.diagram.mermaid)
      .then(({ svg }) => { if (!cancelled) setState({ kind: 'ok', svg }) })
      .catch((err: Error) => { if (!cancelled) setState({ kind: 'error', message: err.message }) })
    return () => { cancelled = true }
  }, [id, step.diagram])

  const captionHtml = useMemo(() => marked.parse(step.body, { async: false }), [step.body])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-1 items-center justify-center overflow-auto p-4">
        {renderBody(state, step.diagram?.mermaid)}
      </div>
      <figcaption
        className="markdown border-border text-text-secondary border-t px-4 py-3 text-xs leading-relaxed"
        dangerouslySetInnerHTML={{ __html: captionHtml }}
      />
    </div>
  )
}

function renderBody(state: RenderState, source: string | undefined): JSX.Element {
  if (state.kind === 'idle') return <p className="text-text-muted text-xs">Rendering…</p>
  if (state.kind === 'error') {
    return (
      <pre className="text-text-danger bg-surface w-full overflow-auto rounded-md p-3 text-xs">
        Bad mermaid: {state.message}
        {source && `\n\n${source}`}
      </pre>
    )
  }
  return <div className="max-w-full" dangerouslySetInnerHTML={{ __html: state.svg }} />
}
