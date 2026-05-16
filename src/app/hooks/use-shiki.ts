import { useEffect, useState } from 'react'
import { createHighlighter, type Highlighter } from 'shiki'

const THEME = 'github-dark-dimmed'

const LANGS = [
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'json',
  'css',
  'html',
  'shell',
  'bash',
  'markdown',
  'python',
  'rust',
  'go',
  'sql',
  'yaml',
] as const

let singleton: Promise<Highlighter> | undefined

function getHighlighter(): Promise<Highlighter> {
  singleton ??= createHighlighter({ themes: [THEME], langs: [...LANGS] })
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
