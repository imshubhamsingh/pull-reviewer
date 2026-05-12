import { useEffect, useMemo, useRef, type JSX } from 'react'
import type { Highlighter, ShikiTransformer } from 'shiki'
import { SHIKI_THEME } from '@/app/hooks/useShiki'

interface HastLineNode {
  properties: Record<string, unknown>
}

interface Props {
  highlighter: Highlighter
  content: string
  lang: string
  focus?: number
  range?: { start: number; end: number }
}

export function ShikiBlock({ highlighter, content, lang, focus, range }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const html = useMemo(
    () => highlighter.codeToHtml(content, {
      lang: ensureLoaded(highlighter, lang),
      theme: SHIKI_THEME,
      transformers: [lineMarker(range, focus)],
    }),
    [highlighter, content, lang, focus, range],
  )

  useEffect(() => {
    if (focus == null || !ref.current) return
    const target = ref.current.querySelector<HTMLElement>(`[data-line="${focus}"]`)
    target?.scrollIntoView({ block: 'center' })
  }, [focus, html])

  return (
    <div
      ref={ref}
      className="shiki-block min-h-0 flex-1 overflow-auto text-xs"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function ensureLoaded(highlighter: Highlighter, lang: string): string {
  return highlighter.getLoadedLanguages().includes(lang) ? lang : 'plaintext'
}

function lineMarker(range: { start: number; end: number } | undefined, focus: number | undefined): ShikiTransformer {
  return {
    line(node, line) {
      const n = node as unknown as HastLineNode
      n.properties['data-line'] = String(line)
      if (range && line >= range.start && line <= range.end) addClass(n, 'line-hl')
      if (focus != null && line === focus) addClass(n, 'line-focus')
    },
  }
}

function addClass(node: HastLineNode, cls: string): void {
  const existing = node.properties.class
  if (typeof existing === 'string' && existing.length) {
    node.properties.class = `${existing} ${cls}`
  } else {
    node.properties.class = cls
  }
}
