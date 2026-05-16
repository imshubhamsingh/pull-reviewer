import type { JSX } from 'react'
import { MermaidPane } from '@/app/components/mermaid-pane'
import { MockupPane } from '@/app/components/mockup-pane'
import type { JumpSource } from '@/app/components/mockup-element'
import type { TourStep } from '@/lib/api'

/**
 * Thin dispatcher for the `diagram` panel kinds. Mermaid variants
 * (sequence/flowchart/er/class/fileGraph) render via `MermaidPane`; the
 * `mockup` variant carries a structured `MockupScene` rendered as a
 * Figma-style flow by `MockupPane`. `onJumpSource` is forwarded so a click
 * on a mockup element with a `source` annotation jumps to its JSX line.
 */

interface Props {
  step: TourStep
  onJumpSource?: JumpSource
}

export function DiagramPane({ step, onJumpSource }: Props): JSX.Element {
  if (step.diagram?.kind === 'mockup') {
    return <MockupPane step={step} scene={step.diagram.mockup} onJumpSource={onJumpSource} />
  }
  return <MermaidPane step={step} />
}
