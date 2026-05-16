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
  diagram?:    Diagram                                               // required when panel === 'diagram'
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

type Diagram =
  | { kind: 'sequence'  | 'flowchart' | 'er' | 'class' | 'fileGraph', mermaid: string }
  | { kind: 'mockup',   mockup: MockupScene }

type MockupScene = {
  frames:       MockupFrame[]                                        // 1-8 screens
  transitions?: MockupTransition[]                                   // up to 20; REQUIRED if frames.length > 1
}

type MockupFrame = {
  id:        string                                                  // stable; referenced by transitions
  title:     string                                                  // <80 chars, shown above the frame on the canvas
  width:     number                                                  // 320-960 typical, cap 1600
  height:    number                                                  // 240-720 typical, cap 2400
  canvasX?:  number                                                  // top-left on the flow canvas; omit to auto-layout
  canvasY?:  number                                                  // omit to auto-layout
  elements:  MockupElement[]                                         // up to 120
}

type MockupTransition = {
  fromFrame: string                                                  // MockupFrame.id
  toFrame:   string                                                  // MockupFrame.id
  trigger:   string                                                  // "click Submit", "form valid", "page load — 200ms"
  fromSide?: 'top' | 'right' | 'bottom' | 'left'                     // anchor hint; auto-derives from relative position
  toSide?:   'top' | 'right' | 'bottom' | 'left'
}

// MockupElement — every primitive shares (x, y, source?). Most also carry (w, h).
// `source` is "<repo-relative path>:<lineStart>-<lineEnd>" pointing to the JSX
// that produces this element. Optional on every element but encouraged.
type MockupElement =
  // Layout
  | { type: 'box',      x, y, w, h, source?, label?: string }
  | { type: 'group',    x, y, w, h, source?, label?: string, children: MockupElement[] }
  | { type: 'divider',  x, y, w, source? }
  | { type: 'spacer',   x, y, w, h, source? }
  // Text
  | { type: 'text',     x, y, source?, text: string, size?: 'xs'|'sm'|'md'|'lg'|'xl', weight?: 'normal'|'medium'|'bold', tone?: 'primary'|'secondary'|'muted'|'danger' }
  | { type: 'link',     x, y, source?, text: string, href?: string }
  | { type: 'code',     x, y, source?, text: string }
  // Interactive
  | { type: 'button',   x, y, w, h, source?, label: string, variant?: 'primary'|'secondary'|'danger'|'ghost'|'icon', icon?: string }
  | { type: 'input',    x, y, w, h, source?, kind?: 'text'|'password'|'email'|'number'|'search', placeholder?: string, value?: string }
  | { type: 'textarea', x, y, w, h, source?, placeholder?: string, value?: string, rows?: number }
  | { type: 'select',   x, y, w, h, source?, placeholder?: string, value?: string, options?: string[] }
  | { type: 'checkbox', x, y, source?, label?: string, checked: boolean }
  | { type: 'radio',    x, y, source?, label?: string, checked: boolean, groupId?: string }
  | { type: 'toggle',   x, y, source?, label?: string, on: boolean }
  // Display
  | { type: 'image',    x, y, w, h, source?, alt?: string }
  | { type: 'avatar',   x, y, source?, size?: number, label?: string }
  | { type: 'icon',     x, y, source?, name: string, size?: number }                  // lucide-react icon name
  | { type: 'badge',    x, y, source?, label: string, tone?: 'primary'|'secondary'|'muted'|'danger'|'success'|'warn' }
  // Data
  | { type: 'table',    x, y, w, h, source?, columns: string[], rows: string[][] }    // <=8 cols, <=12 rows
  | { type: 'list',     x, y, w, h, source?, items: string[], ordered?: boolean }     // <=30 items
  // Navigation
  | { type: 'tabs',     x, y, w, h, source?, tabs: string[], activeIdx?: number }
  | { type: 'nav',      x, y, w, h, source?, items: { label: string, active?: boolean }[], orientation?: 'horizontal'|'vertical' }
  // Overlay
  | { type: 'modal',    x, y, w, h, source?, title?: string, children: MockupElement[] }
  | { type: 'tooltip',  x, y, source?, text: string, anchor?: 'top'|'bottom'|'left'|'right' }

type ChapterCritique = {
  issues:      { severity: 'minor' | 'major' | 'blocker', body, code? }[]   // up to 10
  suggestions: { body, code? }[]                                            // up to 10
}
```
