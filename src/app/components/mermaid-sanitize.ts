/**
 * Defensive pre-processor for LLM-emitted Mermaid.
 *
 * Two known sources of parse errors:
 *
 *  1. **Notes containing `;`** — Mermaid's sequenceDiagram lexer treats `;`
 *     as a top-level statement separator, so notes containing `;` get split
 *     into two statements. Replace `;` with `,` inside note text.
 *
 *  2. **Node labels containing `()` / `[]` / `{}` / `|`** — Mermaid's
 *     flowchart label parser bails on these because they look like shape
 *     delimiters mid-token. Example that breaks:
 *
 *         A[verify() called] --> B[next]
 *
 *     Fix is to wrap the offending label content in double quotes, which
 *     tells Mermaid to read it as an opaque string:
 *
 *         A["verify() called"] --> B[next]
 *
 *     Applied only when the content actually contains a troublesome char
 *     so safe labels are left untouched.
 */
const NOTE_LINE = /^(\s*Note\s+(?:over|left of|right of)\s+[^:]+:)(.*)$/i

export function sanitizeMermaid(source: string): string {
  return source
    .split('\n')
    .map((line) => addStyleContrast(quoteShapeLabels(escapeNoteSemicolons(line))))
    .join('\n')
}

/**
 * Patch `style <id> fill:#hex,...` lines so text on the filled node stays
 * readable. The LLM consistently emits a fill colour without a matching
 * `color:` attribute; mermaid then falls back to the theme's default text
 * (white-ish on the dark theme), which disappears on light fills like
 * `#ffd700`. Picks black or white text based on the fill's luminance.
 */
const STYLE_LINE = /^(\s*style\s+\S+\s+)(.*)$/i
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function addStyleContrast(line: string): string {
  const m = line.match(STYLE_LINE)
  if (!m) return line
  const head = m[1] ?? ''
  const attrs = m[2] ?? ''
  const parts = attrs
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const fillPart = parts.find((p) => /^fill\s*:/i.test(p))
  const hasColor = parts.some((p) => /^color\s*:/i.test(p))
  if (!fillPart || hasColor) return line
  const value = fillPart.split(':')[1]?.trim()
  if (!value || !HEX_RE.test(value)) return line
  const text = isLightHex(value) ? '#0b0c10' : '#f8f9fb'
  return `${head}${attrs.trimEnd()},color:${text}`
}

function isLightHex(hex: string): boolean {
  const h = hex.replace('#', '')
  const r = h.length === 3 ? parseInt(h[0]! + h[0]!, 16) : parseInt(h.slice(0, 2), 16)
  const g = h.length === 3 ? parseInt(h[1]! + h[1]!, 16) : parseInt(h.slice(2, 4), 16)
  const b = h.length === 3 ? parseInt(h[2]! + h[2]!, 16) : parseInt(h.slice(4, 6), 16)
  // ITU-R BT.601 perceptual luminance; threshold ~140 keeps mid-tones readable.
  return 0.299 * r + 0.587 * g + 0.114 * b > 140
}

function escapeNoteSemicolons(line: string): string {
  const m = line.match(NOTE_LINE)
  if (!m) return line
  const head = m[1] ?? ''
  const text = m[2] ?? ''
  return `${head}${text.replace(/;/g, ',')}`
}

const TROUBLESOME = /[()[\]{}|]/

const SHAPE_PATTERNS: ReadonlyArray<{ re: RegExp; open: string; close: string }> = [
  // Square `A[label]` — most common, and the one we've seen break in the wild.
  // The negative lookbehind/lookahead avoid eating `[[ ]]` (subroutine) shapes.
  { re: /(?<![[\w])(\w+)\[(?!\[)([^\]\n]+?)\]/g, open: '[', close: ']' },
  // Diamond `A{label}`.
  { re: /(?<![{\w])(\w+)\{(?!\{)([^}\n]+?)\}/g, open: '{', close: '}' },
]

function quoteShapeLabels(line: string): string {
  let out = line
  for (const { re, open, close } of SHAPE_PATTERNS) {
    out = out.replace(re, (full, id: string, content: string) => {
      if (isAlreadyQuoted(content)) return full
      if (!TROUBLESOME.test(content)) return full
      return `${id}${open}"${escapeInnerQuotes(content)}"${close}`
    })
  }
  return out
}

function isAlreadyQuoted(content: string): boolean {
  const trimmed = content.trim()
  return trimmed.startsWith('"') && trimmed.endsWith('"')
}

function escapeInnerQuotes(content: string): string {
  // Mermaid's `#quot;` HTML-entity-style escape works inside quoted labels.
  return content.replace(/"/g, '#quot;')
}
