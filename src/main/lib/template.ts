/**
 * Tiny `{{var}}` substitution helper for prompt templates loaded from .md
 * files. Missing keys become empty strings unless `strict` is set, which
 * makes them throw — useful in tests to catch typos.
 */
export function template(
  src: string,
  vars: Record<string, string | number | boolean | null | undefined>,
  opts: { strict?: boolean } = {},
): string {
  return src.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key]
    if (value == null) {
      if (opts.strict) throw new Error(`template: missing var '${key}'`)
      return ''
    }
    return String(value)
  })
}
