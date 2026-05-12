import type { PrContext } from '@/main/tour/pr-context.collector'
import { Service } from '@/main/service'

/**
 * Builds the LLM prompt that produces a chapters-shaped tour. The prompt is
 * split into three concerns:
 *   - `renderPrContext`: dynamic per-PR facts (title, files, diff, commits)
 *   - `SCHEMA_REFERENCE`: TypeScript-shaped contract the model must match
 *   - `RULES`: instructions on chapter count, panels, critique, etc.
 *
 * Tool use (Read/Grep/Glob) is NOT enabled yet — that's Phase 5. For now the
 * model only sees the static context we hand it.
 */
export class PromptBuilder extends Service {
  build(ctx: PrContext): string {
    return [renderPrContext(ctx), SCHEMA_REFERENCE, RULES].join('\n\n').trim()
  }
}

function renderPrContext(ctx: PrContext): string {
  const files = ctx.files.map((f) => `- ${f.path}  +${f.additions} -${f.deletions}`).join('\n')
  const commits = ctx.commits.map((c) => `- ${c.sha.slice(0, 7)} ${c.subject}`).join('\n')
  return `You generate JSON tour scripts that help reviewers understand a pull request's *flow* — how the change moves through the codebase, why functions are structured the way they are, and where reviewers should focus.

PR title: ${ctx.title}
PR body:
${ctx.body || '(empty)'}

Changed files (path, +adds, -dels):
${files}

Unified diff (${ctx.diffBytes} bytes shown${ctx.diffTruncated ? ', truncated' : ''}):
\`\`\`diff
${ctx.diff}
\`\`\`

Recent commits:
${commits}`
}

const SCHEMA_REFERENCE = `Output ONLY a JSON array of chapters matching this TypeScript shape. No prose, no markdown fences.

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
  references?: CodePointer[]                                         // <=8 callers/related code worth surfacing
  diagram?:    { kind: 'sequence' | 'flowchart' | 'er' | 'class' | 'fileGraph', mermaid: string }  // required when panel === 'diagram'
}

type CodePointer = {
  file:          string                                              // repo-relative path
  side?:         'before' | 'after' | 'diff'                         // which sha to read from
  lineStart?:    number                                              // 1-based, inclusive
  lineEnd?:      number                                              // 1-based, inclusive
  focusLine?:    number                                              // single line to center on — the call or decision (defaults to lineStart)
  contextLines?: number                                              // extra buffer above/below; renderer hint, defaults to 2
}

type ChapterCritique = {
  issues:      { severity: 'minor' | 'major' | 'blocker', body, code? }[]   // up to 10
  suggestions: { body, code? }[]                                            // up to 10
}`

const RULES = `Rules:

Structure — sized to the PR:
- **You decide the chapter count.** Scale it to the PR:
  - tiny (<10 files): 2-3 chapters
  - medium (10-30 files): 3-6 chapters
  - large (30-60 files): 5-10 chapters
  - sprawling (60+ files or cross-cutting refactor): 8-15 chapters
  These are guides, not quotas. Hard cap is 20 — only used by truly massive PRs.
- Group steps by **area** (e.g. "Backend wiring", "Data model", "Frontend rendering", "Tests"), not by file.
- Each chapter has 2-10 steps. Total step count should scale with PR size — roughly ~1 step per 3-5 changed files.
- Start with a "docs" step that summarises the whole change. Consider a 'diagram' step early on (kind 'fileGraph' or 'sequence') for the big picture.
- Put tests, lockfile changes, and generated files in their own chapter, last.

Step authoring — one thing per step:
- **One concept per step.** If a step would contain an if/else whose branches diverge meaningfully, model them as two steps.
- **The body answers "why" or "what's surprising here"** — not "what" (the reader sees the code). Surface the cookie that's checked, the retry that's silent, the constraint that forced the change, the alternative that was rejected.
- **Order matches reading order.** The first step in a chapter is where you'd start explaining that part on a whiteboard.
- Body is markdown, 1-3 short paragraphs.

Code pointers — land on the right line:
- For 'code' steps, 'code.file' / 'lineStart' / 'lineEnd' MUST come from the diff. 1-based, inclusive.
- **'focusLine' points at the *call* or *decision* the step is about**, not at surrounding boilerplate. Defaults to lineStart but should usually be set explicitly.
- 'contextLines' defaults to 2; bump to 4-6 only for dense code where surrounding context really helps.
- Use 'references[]' to surface callers or related code worth knowing about even when not in the diff. <=8 per step.
- Never invent file paths or line numbers that don't exist in the diff.

Diagrams:
- For 'diagram' steps, write valid Mermaid syntax. Keep diagrams under ~30 nodes — bigger than that is hard to read.
- Prefer 'sequence' for request/call flows, 'flowchart' for control flow / decision trees, 'er' for schema relationships, 'fileGraph' for import/file relationships.

Code-map:
- 'code-map' steps describe an *area* of the codebase at a glance — used for spatial overview, not for reading code.

Critique (chapter.critique) — optional, set only when you have something worth flagging:
- 'issues[]': things that are wrong NOW — bugs, race conditions, missing error handling, leaks, anti-patterns, security or perf concerns. Each has 'severity' ('minor' / 'major' / 'blocker'), a 1-3 sentence body, and optionally a 'code' pointer.
- 'suggestions[]': things that work but could be better — clearer naming, simpler control flow, extraction opportunities.
- Be specific. Reference real code. Avoid generic advice ("consider tests"). Empty critique is better than a noisy one.
- Don't duplicate: if an issue is already covered by a step's narration, skip it.`
