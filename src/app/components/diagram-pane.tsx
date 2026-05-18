import type { JSX } from 'react'
import { MermaidPane } from '@/app/components/mermaid-pane'
import { MockupPane } from '@/app/components/mockup-pane'
import { StateDiagramPane } from '@/app/components/state-diagram-pane'
import type { JumpSource } from '@/app/components/source-wrap'
import type { TourStep } from '@/lib/api'

/**
 * Thin dispatcher for the `diagram` panel kinds.
 * - Mermaid variants (sequence/flowchart/er/class/fileGraph) → `MermaidPane`.
 * - `mockup` → Figma-style flow of wireframe frames (`MockupPane`).
 * - `state` → XState-shaped state machine graph (`StateDiagramPane`).
 *
 * `onJumpSource` is forwarded so a click on any element carrying a `source`
 * annotation jumps to the JSX/TS line via the shared `jumpToRef` pipeline.
 */

interface Props {
  step: TourStep
  onJumpSource?: JumpSource
}

export function DiagramPane({ step, onJumpSource }: Props): JSX.Element {
  if (step.diagram?.kind === 'mockup') {
    return <MockupPane step={step} scene={step.diagram.mockup} onJumpSource={onJumpSource} />
  }
  if (step.diagram?.kind === 'state') {
    return (
      <StateDiagramPane step={step} machine={step.diagram.machine} onJumpSource={onJumpSource} />
    )
  }
  return <MermaidPane step={step} />
}
