import { FileText, MessageSquare } from 'lucide-react'
import { match } from 'ts-pattern'
import type { JSX, ReactNode } from 'react'
import { cn } from '@/app/lib/utils'

export type RightPaneMode = 'map' | 'chat'

interface Props {
  mode: RightPaneMode
  onChange: (mode: RightPaneMode) => void
}

const ICON_SIZE = 12

/** Two-button segmented toggle for the right-pane header. */
export function RightPaneToggle({ mode, onChange }: Props): JSX.Element {
  return (
    <div className="border-border flex shrink-0 overflow-hidden rounded-sm border">
      <ToggleButton mode="map" current={mode} onClick={() => onChange('map')}>
        <FileText size={ICON_SIZE} aria-hidden />
        Map
      </ToggleButton>
      <ToggleButton mode="chat" current={mode} onClick={() => onChange('chat')}>
        <MessageSquare size={ICON_SIZE} aria-hidden />
        Chat
      </ToggleButton>
    </div>
  )
}

interface ToggleButtonProps {
  mode: RightPaneMode
  current: RightPaneMode
  onClick: () => void
  children: ReactNode
}

function ToggleButton({ mode, current, onClick, children }: ToggleButtonProps): JSX.Element {
  const active = mode === current
  const label = match(mode)
    .with('map', () => 'Show file map')
    .with('chat', () => 'Show PR chat')
    .exhaustive()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 px-2 py-0.5 text-[10px] tracking-wider uppercase transition-colors',
        active
          ? 'bg-surface-hover text-text-primary'
          : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary',
      )}
    >
      {children}
    </button>
  )
}
