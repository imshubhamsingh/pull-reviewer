import { useCallback, useEffect, useState } from 'react'

export interface CodeSearchState {
  isOpen: boolean
  query: string
  regex: boolean
  caseSensitive: boolean
  /** Index into the caller's matches array. -1 when no matches. */
  activeIndex: number
}

export interface CodeSearchControls {
  open: () => void
  close: () => void
  setQuery: (q: string) => void
  toggleRegex: () => void
  toggleCase: () => void
  /** Cycle forward through `count` matches (wraps). No-op when count===0. */
  next: (count: number) => void
  /** Cycle backward through `count` matches (wraps). No-op when count===0. */
  prev: (count: number) => void
  setActiveIndex: (i: number) => void
}

export type CodeSearch = CodeSearchState & CodeSearchControls

/**
 * Local state for a single pane's Cmd-F overlay. Callers compute their own
 * matches (the shapes differ between CodePane and DiffPane) and feed `count`
 * back into `next` / `prev` so the cycling stays in sync.
 *
 * `useCmdFListener` is a separate hook so panes can wire the keyboard
 * shortcut only while they're mounted.
 */
export function useCodeSearch(): CodeSearch {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [regex, setRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => {
    setIsOpen(false)
    setActiveIndex(-1)
  }, [])
  const toggleRegex = useCallback(() => setRegex((b) => !b), [])
  const toggleCase = useCallback(() => setCaseSensitive((b) => !b), [])

  const next = useCallback((count: number) => {
    if (count <= 0) return
    setActiveIndex((i) => (i < 0 ? 0 : (i + 1) % count))
  }, [])
  const prev = useCallback((count: number) => {
    if (count <= 0) return
    setActiveIndex((i) => (i <= 0 ? count - 1 : i - 1))
  }, [])

  return {
    isOpen,
    query,
    regex,
    caseSensitive,
    activeIndex,
    open,
    close,
    setQuery,
    toggleRegex,
    toggleCase,
    next,
    prev,
    setActiveIndex,
  }
}

/**
 * Installs a window keydown listener that intercepts Cmd-F / Ctrl-F and
 * calls `open()`. Caller controls when to install — usually as long as the
 * pane is mounted. Returns nothing; the cleanup happens on unmount.
 */
export function useCmdFListener(open: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        open()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
}
