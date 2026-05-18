import type { JSX } from 'react'
import { parseSourceRef, type SourceRef } from '@/app/components/mockup-source'

/**
 * Generic click-to-source wrapper for an SVG element. When the wrapped
 * element carries a `source: "file:lineStart-lineEnd"` annotation, the
 * `<g>` becomes clickable and a native `<title>` provides the hover
 * tooltip. Used by both the mockup and state-diagram renderers.
 */

export type JumpSource = (ref: SourceRef) => void

interface Props {
  source: string | undefined
  onJumpSource: JumpSource | undefined
  children: JSX.Element
}

export function SourceWrap({ source, onJumpSource, children }: Props): JSX.Element {
  if (!source) return children
  const ref = parseSourceRef(source)
  const onClick = ref && onJumpSource ? () => onJumpSource(ref) : undefined
  return (
    <g style={onClick ? { cursor: 'pointer' } : undefined} onClick={onClick}>
      <title>{source}</title>
      {children}
    </g>
  )
}
