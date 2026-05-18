import { Marked, type Tokens } from 'marked'
import { useEffect, useMemo, useRef, type JSX } from 'react'
import { cn } from '@/app/lib/utils'
import { SHIKI_THEME, useShiki } from '@/app/hooks/use-shiki'
import type { SymbolLocation } from '@/lib/api'

/**
 * Renders LLM / user-authored markdown with Shiki-highlighted fenced code
 * blocks. Falls back to a plain `<pre><code>` block while Shiki is still
 * loading, or when the requested language isn't registered with the shared
 * highlighter (see `use-shiki.ts` for the language list).
 *
 * When `symbols` + `onJumpToSymbol` are supplied, inline `<code>foo</code>`
 * tokens whose text matches a `symbols` key become clickable — same UX as
 * AI finding bodies use to jump from an identifier to its definition.
 */

interface Props {
  body: string
  className?: string
  symbols?: Record<string, SymbolLocation>
  onJumpToSymbol?: (loc: SymbolLocation) => void
}

// Common short aliases users / LLMs write that Shiki doesn't accept verbatim
// because we register only the canonical names in use-shiki.ts. Keep this
// list small — extend only when a real diff surfaces an unhandled alias.
const LANG_ALIAS: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  sh: 'bash',
  py: 'python',
  rs: 'rust',
  yml: 'yaml',
}

export function MarkdownView({ body, className, symbols, onJumpToSymbol }: Props): JSX.Element {
  const hl = useShiki()
  const ref = useRef<HTMLDivElement>(null)
  const html = useMemo(() => {
    const m = new Marked()
    m.use({
      renderer: {
        code({ text, lang }: Tokens.Code): string {
          const resolved = lang ? (LANG_ALIAS[lang] ?? lang) : undefined
          if (hl && resolved) {
            try {
              return hl.codeToHtml(text, { lang: resolved, theme: SHIKI_THEME })
            } catch {
              /* fall through to plain block */
            }
          }
          const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : ''
          return `<pre><code${langAttr}>${escapeHtml(text)}\n</code></pre>`
        },
      },
    })
    return m.parse(body, { async: false }) as string
  }, [body, hl])

  // Walk inline `<code>` spans (NOT those inside `<pre>`) and wire click-to-jump
  // for ones whose text matches a `symbols` key.
  useEffect(() => {
    if (!symbols || !onJumpToSymbol) return
    const root = ref.current
    if (!root) return
    const cleanups: Array<() => void> = []
    root.querySelectorAll<HTMLElement>('code').forEach((el) => {
      if (el.closest('pre')) return
      const key = el.textContent ?? ''
      const loc = symbols[key]
      if (!loc) return
      el.classList.add('cursor-pointer', 'hover:underline', 'text-text-brand')
      el.title = `Jump to ${loc.file}:${loc.line}`
      const onClick = (): void => onJumpToSymbol(loc)
      el.addEventListener('click', onClick)
      cleanups.push(() => el.removeEventListener('click', onClick))
    })
    return () => cleanups.forEach((c) => c())
  }, [html, symbols, onJumpToSymbol])

  return (
    <div
      ref={ref}
      className={cn('markdown', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
