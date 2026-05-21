/**
 * Single source of truth for syntax-highlighting languages. Each entry says
 * which shiki language id to use and which file extensions / filenames map
 * to it. Adding a language is a one-line change here; both shiki bundle
 * loading (via `SHIKI_LANGS`) and the file → language lookup (`inferLang`)
 * are derived from this list.
 *
 * Trade-off: shiki loads every bundled language eagerly, so the list adds
 * to startup time. Keep it to "things we actually expect to see in PRs".
 * Lazy loading is possible later via shiki's `loadLanguage` API if needed.
 */

import type { BundledLanguage } from 'shiki'

export interface LanguageEntry {
  /** Shiki language id — must be in the `bundledLanguages` map. */
  id: BundledLanguage
  /** File extensions (lowercase, no leading dot). At least one of
   *  `extensions` / `filenames` must be present. */
  extensions?: readonly string[]
  /** Exact filename matches (case-insensitive). For things like
   *  `Dockerfile`, `Makefile` that have no extension. */
  filenames?: readonly string[]
}

const LANGUAGES: readonly LanguageEntry[] = [
  { id: 'typescript', extensions: ['ts', 'mts', 'cts'] },
  { id: 'tsx', extensions: ['tsx'] },
  { id: 'javascript', extensions: ['js', 'mjs', 'cjs'] },
  { id: 'jsx', extensions: ['jsx'] },
  { id: 'json', extensions: ['json', 'jsonc'] },
  { id: 'css', extensions: ['css'] },
  { id: 'scss', extensions: ['scss'] },
  { id: 'less', extensions: ['less'] },
  { id: 'html', extensions: ['html', 'htm'] },
  { id: 'markdown', extensions: ['md', 'mdx'] },
  { id: 'python', extensions: ['py', 'pyi'] },
  { id: 'rust', extensions: ['rs'] },
  { id: 'go', extensions: ['go'] },
  { id: 'sql', extensions: ['sql'] },
  { id: 'yaml', extensions: ['yml', 'yaml'] },
  { id: 'toml', extensions: ['toml'] },
  { id: 'xml', extensions: ['xml'] },
  { id: 'bash', extensions: ['sh', 'bash', 'zsh'] },
  { id: 'graphql', extensions: ['graphql', 'gql'] },
  { id: 'ruby', extensions: ['rb'] },
  { id: 'java', extensions: ['java'] },
  { id: 'kotlin', extensions: ['kt', 'kts'] },
  { id: 'swift', extensions: ['swift'] },
  { id: 'c', extensions: ['c', 'h'] },
  { id: 'cpp', extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hxx'] },
  { id: 'csharp', extensions: ['cs'] },
  { id: 'php', extensions: ['php'] },
  { id: 'vue', extensions: ['vue'] },
  { id: 'svelte', extensions: ['svelte'] },
  { id: 'protobuf', extensions: ['proto'] },
  { id: 'dockerfile', filenames: ['dockerfile'] },
]

/** Languages to load into the shiki highlighter at startup. */
export const SHIKI_LANGS: readonly BundledLanguage[] = LANGUAGES.map((l) => l.id)

/** Resolve a file path to a shiki language id. Falls back to `plaintext`. */
export function inferLang(file: string): string {
  const base = (file.split('/').pop() ?? '').toLowerCase()
  const byName = FILENAME_TO_LANG.get(base)
  if (byName) return byName
  const dot = base.lastIndexOf('.')
  const ext = dot >= 0 ? base.slice(dot + 1) : ''
  return EXT_TO_LANG.get(ext) ?? 'plaintext'
}

const EXT_TO_LANG = new Map<string, string>(
  LANGUAGES.flatMap((l) => (l.extensions ?? []).map((ext) => [ext, l.id] as const)),
)

const FILENAME_TO_LANG = new Map<string, string>(
  LANGUAGES.flatMap((l) => (l.filenames ?? []).map((name) => [name, l.id] as const)),
)
