import { useEffect, useRef, type JSX } from 'react'
import { ChevronDown, ChevronUp, Regex, X } from 'lucide-react'
import { cn } from '@/app/lib/utils'
import type { CodeSearch } from '@/app/hooks/use-code-search'

/**
 * Floating Cmd-F overlay pinned to the top-right of its host pane. Renders
 * the input, match counter, regex / case toggles, prev/next buttons, and a
 * close button. Stays out of the way when `search.isOpen` is false.
 *
 * Enter inside the input cycles forward, Shift-Enter cycles back, Esc
 * closes — same as browser Cmd-F.
 */
export function CodeSearchOverlay({
  search,
  matchCount,
}: {
  search: CodeSearch
  matchCount: number
}): JSX.Element | null {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (search.isOpen) inputRef.current?.focus()
  }, [search.isOpen])

  if (!search.isOpen) return null

  const counter =
    search.query === ''
      ? ''
      : matchCount === 0
        ? 'no matches'
        : `${search.activeIndex < 0 ? 1 : search.activeIndex + 1} / ${matchCount}`

  return (
    <div
      role="search"
      className="border-border bg-surface absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md border px-1.5 py-1 shadow-md"
    >
      <input
        ref={inputRef}
        value={search.query}
        onChange={(e) => search.setQuery(e.target.value)}
        placeholder="Search…"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (e.shiftKey) search.prev(matchCount)
            else search.next(matchCount)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            search.close()
          }
        }}
        className="bg-bg border-border text-text-primary placeholder:text-text-muted w-44 rounded-sm border px-2 py-0.5 text-xs outline-none"
      />
      <span className="text-text-muted min-w-[4.5rem] px-1 text-right text-[10px] tabular-nums select-none">
        {counter}
      </span>
      <ToggleBtn
        active={search.caseSensitive}
        onClick={search.toggleCase}
        title="Case sensitive"
        label="Aa"
      />
      <ToggleBtn
        active={search.regex}
        onClick={search.toggleRegex}
        title="Regular expression"
        icon={<Regex size={12} aria-hidden />}
      />
      <NavBtn
        onClick={() => search.prev(matchCount)}
        disabled={matchCount === 0}
        title="Previous match (Shift-Enter)"
        icon={<ChevronUp size={14} aria-hidden />}
      />
      <NavBtn
        onClick={() => search.next(matchCount)}
        disabled={matchCount === 0}
        title="Next match (Enter)"
        icon={<ChevronDown size={14} aria-hidden />}
      />
      <button
        type="button"
        onClick={search.close}
        title="Close search (Esc)"
        className="text-text-secondary hover:text-text-primary ml-0.5 shrink-0 rounded-sm p-0.5 transition-colors"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}

function ToggleBtn({
  active,
  onClick,
  title,
  label,
  icon,
}: {
  active: boolean
  onClick: () => void
  title: string
  label?: string
  icon?: JSX.Element
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-sm px-1 py-0.5 text-[10px] transition-colors',
        active
          ? 'bg-surface-hover text-text-primary'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
      )}
    >
      {icon ?? label}
    </button>
  )
}

function NavBtn({
  onClick,
  disabled,
  title,
  icon,
}: {
  onClick: () => void
  disabled: boolean
  title: string
  icon: JSX.Element
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="text-text-secondary hover:bg-surface-hover hover:text-text-primary shrink-0 rounded-sm p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
    >
      {icon}
    </button>
  )
}
