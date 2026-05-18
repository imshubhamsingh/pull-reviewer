/**
 * Defensive pre-processor for LLM-emitted Mermaid. Mermaid's sequenceDiagram
 * lexer treats `;` as a top-level statement separator, so notes containing
 * `;` in their text get split into two statements and fail to parse. Escape
 * `;` inside note text so the text token captures the whole line.
 */
const NOTE_LINE = /^(\s*Note\s+(?:over|left of|right of)\s+[^:]+:)(.*)$/i

export function sanitizeMermaid(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      const m = line.match(NOTE_LINE)
      if (!m) return line
      const head = m[1] ?? ''
      const text = m[2] ?? ''
      return `${head}${text.replace(/;/g, ',')}`
    })
    .join('\n')
}
