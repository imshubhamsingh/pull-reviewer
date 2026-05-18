import { type JSX } from 'react'
import { match } from 'ts-pattern'
import { cn } from '@/app/lib/utils'
import { SHIKI_THEME, type useShiki } from '@/app/hooks/use-shiki'
import { inferLang } from '@/app/lib/code-utils'
import type { BundledLanguage } from 'shiki'

/**
 * Inline-style backgrounds so we don't depend on Tailwind utilities the
 * project's @theme block doesn't generate (the codebase only declares brand
 * colors there).
 */
export const DIFF_STYLE = {
  delBg: 'rgba(239, 68, 68, 0.18)',
  delFill: 'rgba(239, 68, 68, 0.07)',
  addBg: 'rgba(34, 197, 94, 0.18)',
  addFill: 'rgba(34, 197, 94, 0.07)',
} as const

export type FileStatus = 'added' | 'removed' | 'changed' | 'unchanged'

export function FileBanner({
  file,
  status,
}: {
  file: string
  status: FileStatus
}): JSX.Element | null {
  if (status === 'changed') return null
  const palette = match(status)
    .with('added', () => ({
      bg: 'rgba(34, 197, 94, 0.10)',
      fg: 'rgb(74, 222, 128)',
      label: 'New file',
    }))
    .with('removed', () => ({
      bg: 'rgba(239, 68, 68, 0.10)',
      fg: 'rgb(251, 113, 133)',
      label: 'Deleted file',
    }))
    .with('unchanged', () => ({
      bg: 'transparent',
      fg: 'var(--color-text-muted)',
      label: 'No changes between base and head',
    }))
    .exhaustive()
  return (
    <p
      className="border-border border-b px-3 py-1.5 text-[11px] italic"
      style={{ backgroundColor: palette.bg, color: palette.fg }}
    >
      {palette.label} · {file}
    </p>
  )
}

export function DiffHeader(): JSX.Element {
  return (
    <div className="border-border text-text-muted bg-surface flex border-b text-[10px] tracking-wider uppercase">
      <div className="border-border flex-1 border-r px-3 py-1">Base</div>
      <div className="flex-1 px-3 py-1">Head</div>
    </div>
  )
}

export function CodeContent({
  content,
  hl,
  file,
}: {
  content: string
  hl: ReturnType<typeof useShiki>
  file: string
}): JSX.Element {
  if (!hl) return <span>{content || ' '}</span>
  if (!content) return <span> </span>
  const lang = inferLang(file)
  const safe = (hl.getLoadedLanguages().includes(lang) ? lang : 'plaintext') as BundledLanguage
  const { tokens } = hl.codeToTokens(content, { lang: safe, theme: SHIKI_THEME })
  const line = tokens[0] ?? []
  return (
    <>
      {line.map((t, i) => (
        <span key={i} style={{ color: t.color }}>
          {t.content}
        </span>
      ))}
    </>
  )
}

export function Notice({
  children,
  tone,
}: {
  children: React.ReactNode
  tone?: 'danger' | 'warn'
}): JSX.Element {
  return (
    <p
      className={cn(
        'text-text-muted grid h-full place-content-center text-xs',
        tone === 'danger' && 'text-text-danger',
        tone === 'warn' && 'text-text-secondary',
      )}
    >
      {children}
    </p>
  )
}
