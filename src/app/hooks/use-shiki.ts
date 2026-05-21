import { useEffect, useState } from 'react'
import { createHighlighter, type Highlighter } from 'shiki'
import { SHIKI_LANGS } from '@/app/lib/language-registry'

const THEME = 'github-dark-dimmed'

let singleton: Promise<Highlighter> | undefined

function getHighlighter(): Promise<Highlighter> {
  singleton ??= createHighlighter({ themes: [THEME], langs: [...SHIKI_LANGS] })
  return singleton
}

/** Returns a shared shiki Highlighter once it has finished loading; undefined while pending. */
export function useShiki(): Highlighter | undefined {
  const [hl, setHl] = useState<Highlighter | undefined>()
  useEffect(() => {
    let cancelled = false
    void getHighlighter().then((h) => {
      if (!cancelled) setHl(h)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return hl
}

export const SHIKI_THEME = THEME
