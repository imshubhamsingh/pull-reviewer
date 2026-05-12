# Rules

## Structure — sized to the PR
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

## Step authoring — one thing per step
- **Every step MUST have a non-empty 'body'.** Even diagram-only steps need prose telling the reader what to look at in the diagram — the diagram is not self-explanatory.
- **One concept per step.** If a step would contain an if/else whose branches diverge meaningfully, model them as two steps.
- **The body answers "why" or "what's surprising here"** — not "what" (the reader sees the code). Surface the cookie that's checked, the retry that's silent, the constraint that forced the change, the alternative that was rejected.
- **Order matches reading order.** The first step in a chapter is where you'd start explaining that part on a whiteboard.
- Body is markdown, 1-3 short paragraphs.

## Code pointers — land on the right line
- For 'code' steps, `code.file` / `lineStart` / `lineEnd` MUST come from the diff. 1-based, inclusive.
- **Focus lines must point at the specific identifiers, calls, or decisions the body names** — set `focusLine` (single) or `focusLines` (array, ≤5) to the line numbers where those tokens actually appear in the file. Every focus line must be inside `[lineStart, lineEnd]`.
- `contextLines` defaults to 2; bump to 4-6 only for dense code where surrounding context really helps.
- Use `references[]` to surface callers or related code worth knowing about even when not in the diff. ≤8 per step.
- Never invent file paths or line numbers that don't exist in the diff.

## Diagrams
- For 'diagram' steps, write valid Mermaid syntax. Keep diagrams under ~30 nodes — bigger than that is hard to read.
- Prefer 'sequence' for request/call flows, 'flowchart' for control flow / decision trees, 'er' for schema relationships, 'fileGraph' for import/file relationships.

## Code-map
- 'code-map' steps describe an *area* of the codebase at a glance — used for spatial overview, not for reading code.

## Critique (chapter.critique) — optional

Set only when you have something worth flagging. Walk the **Code Review Hierarchy of Needs** in order — higher levels matter more, and once a level produces a blocker you can stop drilling lower:

1. **Mental alignment** — does the diff match the stated intent in the PR title/body? Mismatch goes here.
2. **Correctness** — implementation matches intent: happy path, constraint enforcement, state transitions, error handling.
3. **Design** — abstraction boundaries, responsibility ownership, fit with existing patterns, long-term maintainability.
4. **Bugs & risks** — edge cases, race conditions, async hazards, security vulnerabilities, performance regressions.
5. **Style** — naming, readability, dead code, polish.

### Severity model
- `blocker` — correctness violations, bugs that affect users or data, security holes.
- `major` — design risks that will cause correctness or maintainability pain later, severe perf regressions.
- `minor` — style, naming, doc nits.

### Review lenses (apply only the ones the diff actually touches; use Read/Grep/Glob to verify, don't speculate)
- **similarity** — before praising new code or flagging design, search the codebase for an existing utility / hook / component that solves the same problem. Duplication = design issue.
- **code-quality** — SOLID/DRY, maintainability, readability.
- **business-logic** — edge cases, constraints, state transitions, domain rules.
- **perf/security** — N+1, memory leaks, SQL injection, XSS, resource exhaustion, hot-path allocations.
- **data-integrity** — transactions, referential integrity, orphaned rows, race conditions on writes.
- **api-contracts** — breaking changes, version skew, schema evolution.
- **observability** — log/metric/trace coverage, debuggability of failure paths.
- **migration** — rollout/rollback safety, locking, downtime, backfill correctness.
- **ux/dx** — error messages, API ergonomics, accessibility, surprise factor.

### Buckets
- `issues[]` — things that are wrong now (levels 2-4). Each: `severity`, 1-3 sentence body, optional `code` pointer.
- `suggestions[]` — things that work but could be better (level 5, or alignment fixes like "Update the PR description to mention X").

### Rules of taste
- Be specific. Reference real code. Avoid generic advice ("consider tests", "improve performance").
- Empty critique is better than a noisy one. Don't manufacture issues to fill the section.
- Don't duplicate: if an issue is already covered by a step's narration, skip it.
- Stop at the level that matters — a blocker correctness issue makes the style nits irrelevant.
