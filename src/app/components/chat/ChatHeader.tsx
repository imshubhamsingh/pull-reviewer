import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type JSX, type ReactNode } from 'react'
import { cn } from '@/app/lib/utils'
import type { PrChat } from '@/lib/api'

const ICON_SIZE = 14

interface Props {
  chats: PrChat[]
  activeChatId: number | null
  onSelect: (id: number) => void
  onNew: () => void | Promise<void>
  onRename: (id: number, title: string) => void | Promise<void>
  onDelete: (id: number) => void | Promise<void>
}

/**
 * Top strip of the ChatPane: chat picker + actions.
 *
 * - A small select drives switching between chats.
 * - "+ New" creates an empty chat the user types into.
 * - Title click enters inline rename (Enter to commit, Esc to cancel).
 * - Trash icon deletes after a confirm-prompt; no chats remaining → falls
 *   back to the new-chat empty state.
 */
export function ChatHeader({ chats, activeChatId, onSelect, onNew, onRename, onDelete }: Props): JSX.Element {
  const active = chats.find((c) => c.id === activeChatId) ?? null
  const [renaming, setRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')

  const startRename = (): void => {
    if (!active) return
    setDraftTitle(active.title)
    setRenaming(true)
  }

  const commitRename = (): void => {
    if (!active) { setRenaming(false); return }
    const next = draftTitle.trim()
    if (next && next !== active.title) void onRename(active.id, next)
    setRenaming(false)
  }

  return (
    <div className="border-border bg-bg shrink-0 border-b px-3 py-2">
      <div className="flex items-center gap-2">
        {chats.length > 0 ? (
          <select
            value={activeChatId ?? ''}
            onChange={(e) => onSelect(Number(e.target.value))}
            className="border-border bg-surface text-text-secondary min-w-0 flex-1 truncate rounded-sm border px-2 py-1 text-xs outline-none"
            aria-label="Select chat"
          >
            {chats.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        ) : (
          <span className="text-text-muted flex-1 truncate text-xs">No chats yet</span>
        )}
        <IconButton title="New chat" onClick={() => { void onNew() }}>
          <Plus size={ICON_SIZE} aria-hidden />
        </IconButton>
        {active && (
          <IconButton title="Rename" onClick={startRename} disabled={renaming}>
            <Pencil size={ICON_SIZE} aria-hidden />
          </IconButton>
        )}
        {active && (
          <IconButton
            title="Delete chat"
            onClick={() => {
              if (confirm(`Delete "${active.title}"?`)) void onDelete(active.id)
            }}
          >
            <Trash2 size={ICON_SIZE} aria-hidden />
          </IconButton>
        )}
      </div>
      {renaming && active && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              else if (e.key === 'Escape') setRenaming(false)
            }}
            className="border-border bg-surface text-text-primary min-w-0 flex-1 rounded-sm border px-2 py-1 text-xs outline-none"
          />
          <button
            type="button"
            onClick={commitRename}
            className="text-text-secondary hover:text-text-primary text-[11px] transition-colors"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setRenaming(false)}
            className="text-text-muted hover:text-text-primary text-[11px] transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

interface IconButtonProps {
  title: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}

function IconButton({ title, onClick, disabled, children }: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        'text-text-secondary hover:bg-surface-hover hover:text-text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm transition-colors',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      {children}
    </button>
  )
}
