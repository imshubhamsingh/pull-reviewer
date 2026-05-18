import mermaid from 'mermaid'
import { useEffect, useState, type JSX } from 'react'
import { cn } from '@/app/lib/utils'
import { MarkdownView } from '@/app/components/markdown-view'
import { sanitizeMermaid } from '@/app/components/mermaid-sanitize'
import type { Finding, SymbolLocation } from '@/lib/api'

/**
 * Renders a finding's body (and suggestion + optional Mermaid diagram)
 * with `` `inline-code` `` spans turned into click-to-jump buttons when
 * the token matches `finding.symbols`. Unmatched tokens render as plain
 * `<code>`. Pure presentational — jumping is the parent's concern.
 */

interface Props {
  finding: Finding
  onJumpToSymbol: (loc: SymbolLocation) => void
  className?: string
}

export function FindingBody({ finding, onJumpToSymbol, className }: Props): JSX.Element {
  const symbols = finding.symbols
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <MarkdownView
        body={finding.body}
        className="text-text-primary"
        symbols={symbols}
        onJumpToSymbol={onJumpToSymbol}
      />
      {finding.suggestion && (
        <MarkdownView
          body={`**Suggestion:** ${finding.suggestion}`}
          className="text-text-secondary"
          symbols={symbols}
          onJumpToSymbol={onJumpToSymbol}
        />
      )}
      {finding.mermaid && <FindingMermaid id={`finding-${finding.id}`} source={finding.mermaid} />}
    </div>
  )
}

function FindingMermaid({ id, source }: { id: string; source: string }): JSX.Element {
  // One-shot init for the renderer-side mermaid singleton. Safe to call
  // multiple times — mermaid memoises the config internally.
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'strict',
      fontFamily: 'inherit',
    })
  }, [])

  const [state, setState] = useState<
    { kind: 'idle' } | { kind: 'ok'; svg: string } | { kind: 'error'; message: string }
  >({ kind: 'idle' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'idle' })
    // Sanitise the id — mermaid requires a CSS-id-safe value.
    const safeId = `m${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    mermaid
      .render(safeId, sanitizeMermaid(source))
      .then(({ svg }) => {
        if (!cancelled) setState({ kind: 'ok', svg })
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ kind: 'error', message: err.message })
      })
    return () => {
      cancelled = true
    }
  }, [id, source])

  if (state.kind === 'idle') {
    return <p className="text-text-muted mt-1 text-[10px] italic">Rendering diagram…</p>
  }
  if (state.kind === 'error') {
    return (
      <pre className="text-text-danger bg-surface my-1 max-w-full overflow-auto rounded-md p-2 text-[10px]">
        Bad mermaid: {state.message}
      </pre>
    )
  }
  return (
    <div
      className="border-border bg-bg my-1 overflow-x-auto rounded-md border p-2"
      // mermaid emits sanitised SVG markup; safe with securityLevel: 'strict'
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  )
}
