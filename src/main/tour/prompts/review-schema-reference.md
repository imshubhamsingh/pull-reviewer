# Output schema

Output ONLY a single JSON object matching this TypeScript shape. No prose before, no prose after, no markdown fences.

```ts
type Review = {
  lensesApplied: Lens[]                                     // which lenses you ran
  lensesSkipped: { lens: Lens, reason: string }[]           // which you skipped and why (1-line each)
  prShape?:      PrShape                                    // top-of-tour size / time / complexity summary (Step 0)
  findings:      Finding[]                                  // up to 60; prioritise blockers > major > minor if you hit the cap
}

type PrShape = {
  size:            'small' | 'medium' | 'large' | 'very-large'
  reviewMinutes:   number                                   // 5..600; minutes for a lead-engineer first pass
  rationale:       string                                   // 1-2 sentences explaining size + time
  splitSuggestion?: {                                       // ONLY when size is large/very-large AND the diff decomposes
    summary: string                                         // 1-2 sentence pitch
    stacks:  { title: string, rationale: string, files?: string[] }[]  // 2-6 entries in dependency order
  }
  complexityFlags: {                                        // up to 20; empty array when nothing crosses the thresholds
    kind:     'cyclomatic' | 'file-length' | 'function-length' | 'nesting' | 'churn' | 'pattern' | 'duplication'
    severity: 'blocker' | 'major' | 'minor'
    body:     string                                        // <=800 chars — what's wrong, citing files/functions
    suggestion?: string                                     // <=800 chars — how to fix
    code?:    {                                             // same shape as Finding.code
      file: string, side?: 'before'|'after'|'diff', lineStart?: number, lineEnd?: number
    }
  }[]
}

type Lens =
  | 'code-quality'
  | 'business-logic'
  | 'data-integrity'
  | 'api-contracts'
  | 'performance-security'
  | 'observability'
  | 'migration'
  | 'design-system'
  | 'ux-dx'

type Finding = {
  id:        string                                         // stable: "<lens>/<file>/<lineStart>" or "<lens>/cross-cutting/<n>"
  lens:      Lens
  severity:  'blocker' | 'major' | 'minor'
  body:      string                                         // 1-3 sentences — what's wrong + why it matters
  code?:     {                                              // omit for cross-cutting findings (no specific file)
    file:       string                                      // repo-relative path
    side?:      'before' | 'after' | 'diff'
    lineStart?: number                                      // 1-based
    lineEnd?:   number
  }
  suggestion?: string                                       // optional "here's how to fix it" — concrete, references real code
  symbols?:    Record<string, { file: string, line: number }>  // click-to-jump map: identifier → definition; keys must match backticked tokens in body/suggestion
  mermaid?:    string                                       // LEGACY: single Mermaid diagram source. Prefer `diagrams[]`.
  diagrams?:   Diagram[]                                    // structured diagrams (cap 10); preferred over `mermaid`. Backend findings often attach class + ER + sequence.
}

type Diagram =
  | { kind: 'sequence',  mermaid: string }
  | { kind: 'flowchart', mermaid: string }
  | { kind: 'er',        mermaid: string }
  | { kind: 'class',     mermaid: string }
// State machines: use kind: 'flowchart' with `stateDiagram-v2` as the first line
// of the mermaid source. Mermaid auto-detects the type from the source. Do NOT
// emit kind: 'state' / 'mockup' for findings — those expect structured payloads
// only used by tour steps.
```

## Severity mapping

Reviewer-style prompts use Critical / High / Medium / Low. Map them to our 3-level model:

| Reviewer-style | Output as |
|---|---|
| Critical          | `blocker` |
| High (correctness bug) | `blocker` |
| High (design risk)     | `major` |
| Medium                 | `major` |
| Low                    | `minor` |

## Finding id rules

The id is the dismissal key — it must stay stable across re-generations of the same review (same head_sha). Format:

- **File-anchored findings**: `<lens>/<file>/<lineStart>` — e.g. `performance-security/src/api/users.ts/42`.
- **Cross-cutting findings**: `<lens>/cross-cutting/<n>` — `n` is the index of this finding within its lens (1-based). Use only when there is no single anchor file.

When two findings would collide on id (same lens + file + line), append `#<n>` for the second, third, etc.: `performance-security/src/api/users.ts/42#2`.
