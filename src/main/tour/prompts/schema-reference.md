Output ONLY a JSON array of chapters matching this TypeScript shape. No prose, no markdown fences.

```ts
type Tour = TourChapter[]

type TourChapter = {
  id:        string                       // stable kebab-case
  title:     string                       // <60 chars, e.g. "Backend wiring"
  summary?:  string                       // 1-line tag under the title
  critique?: ChapterCritique              // optional review feedback for this chapter
  steps:     TourStep[]                   // 2-10 ordered steps
}

type TourStep = {
  id:          string                                                // stable kebab-case
  panel:       'docs' | 'code' | 'code-map' | 'diagram'
  title:       string                                                // <80 chars
  body:        string                                                // markdown, 1-3 short paragraphs
  code?:       CodePointer                                           // required when panel === 'code'
  references?: CodePointer[]                                         // <=16 callers/related code worth surfacing
  diagram?:    { kind: 'sequence' | 'flowchart' | 'er' | 'class' | 'fileGraph', mermaid: string }  // required when panel === 'diagram'
}

type CodePointer = {
  file:          string                                              // repo-relative path
  side?:         'before' | 'after' | 'diff'                         // which sha to read from
  lineStart?:    number                                              // 1-based, inclusive
  lineEnd?:      number                                              // 1-based, inclusive
  focusLine?:    number                                              // single line to center on — the call or decision (defaults to lineStart)
  focusLines?:   number[]                                            // up to 10 lines to emphasise when narration calls out multiple spots
  contextLines?: number                                              // extra buffer above/below; renderer hint, defaults to 2
}

type ChapterCritique = {
  issues:      { severity: 'minor' | 'major' | 'blocker', body, code? }[]   // up to 10
  suggestions: { body, code? }[]                                            // up to 10
}
```
