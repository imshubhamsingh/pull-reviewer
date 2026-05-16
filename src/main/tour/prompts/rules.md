# Rules

## Streaming feedback — narrate as you work
- **Begin your response with 1-3 sentences of plain-text plan** before the JSON. Name the chapter count you intend and the broad areas you'll group by ("Analyzing 47 files. Will structure as 6 chapters: backend wiring, data model, frontend, auth, tests, supporting changes."). This gives the user visibility while you work — the parser strips everything before the first `[` of the JSON array.
- **Use Read or Grep at least once per chapter you author**, even when the diff text in your context is clear. Reading at least one file per chapter both grounds your understanding and emits a visible activity event for the user. On large PRs this is non-optional — silent generation looks like the app has hung.
- After the plan + tool calls, output the JSON array as the final block. Nothing after the closing `]`.

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

## Coverage — every file appears somewhere
- **Every file in the PR diff MUST appear in at least one step**, either as `code.file` (the file pinned to that step) OR inside some step's `references[]` (a mentioned file). No file may be silently dropped.
- The interesting files become `code.file` of their own steps. The supporting cast — tests, lockfiles, generated assets, binaries, config tweaks — can be batched into the final chapter's steps via `references[]` (≤16 per step, so multiple steps if needed).
- For a file you have nothing meaningful to say about (e.g., `+0/-0` binary, lockfile churn): still surface it in `references[]` of a step like "Supporting changes" so the reader knows it shifted. A one-line mention is enough.

## Step authoring — one thing per step
- **Every step MUST have a non-empty 'body'.** Even diagram-only steps need prose telling the reader what to look at in the diagram — the diagram is not self-explanatory.
- **One concept per step.** If a step would contain an if/else whose branches diverge meaningfully, model them as two steps.
- **The body answers "why" or "what's surprising here"** — not "what" (the reader sees the code). Surface the cookie that's checked, the retry that's silent, the constraint that forced the change, the alternative that was rejected.
- **Order matches reading order.** The first step in a chapter is where you'd start explaining that part on a whiteboard.
- Body is markdown, 1-3 short paragraphs.

## Code pointers — land on the right line
- For 'code' steps, `code.file` / `lineStart` / `lineEnd` MUST come from the diff. 1-based, inclusive.
- **Focus lines must point at the specific identifiers, calls, or decisions the body names** — set `focusLine` (single) or `focusLines` (array, ≤10) to the line numbers where those tokens actually appear in the file. Every focus line must be inside `[lineStart, lineEnd]`.
- `contextLines` defaults to 2; bump to 4-6 only for dense code where surrounding context really helps.
- Use `references[]` to surface callers or related code worth knowing about even when not in the diff. ≤16 per step.
- Never invent file paths or line numbers that don't exist in the diff.

## Diagrams
- For 'diagram' steps, write valid Mermaid syntax. Keep diagrams under ~30 nodes — bigger than that is hard to read.
- Prefer 'sequence' for request/call flows, 'flowchart' for control flow / decision trees, 'er' for schema relationships, 'fileGraph' for import/file relationships.
- For visual layout of new screens / modals / dialogs / forms / wizards, use the **'mockup'** diagram kind instead — see the "UI Mockups" section below.

## UI Mockups (diagram.kind = 'mockup')
The `mockup` diagram kind is a structured JSON wireframe (not Mermaid). It renders as a Figma-style flow: every frame laid out on one pannable canvas with labeled arrows between them. Use it when the PR adds or substantially changes screens, modals, forms, or multi-step flows — the user-visible *shape*, not the call graph.

- **When to emit:** at least one mockup step inside the User journey chapter when the PR introduces new UI or rearranges existing screens. Pure backend / refactor PRs skip mockups entirely.
- **`mockup.frames[]` — one frame per visual state the user actually sees.** Re-read your `body` narration before deciding the frame list: any screen, redirect target, loading state, modal, or post-action variant that's mentioned should appear as its own frame. If the user's eyes see a different layout, it's a new frame. Don't collapse intermediate states into a "before / after" pair — the in-between frames are usually the most informative for a reviewer. Cap is 8.
- **Coordinates inside a frame are unitless.** Frame `width` 320-960 px and `height` 240-720 px are typical. Pack elements in top-down reading order; nest with `group` for cards / sections / panels.
- **Available element `type`s** (24 total): `box`, `group`, `divider`, `spacer`, `text`, `link`, `code`, `button`, `input`, `textarea`, `select`, `checkbox`, `radio`, `toggle`, `image`, `avatar`, `icon`, `badge`, `table`, `list`, `tabs`, `nav`, `modal`, `tooltip`. See `schema-reference.md` for required/optional fields per kind.
- **Lo-fi by construction.** No shadows, gradients, custom colors. The only tone hints are `variant` on `button`, `tone` on `text` and `badge`, and `active` flags on `tabs`/`nav`. Don't try to mirror Tailwind colors — wireframe is the goal.
- **`source: "<repo-relative path>:<lineStart>-<lineEnd>"` on any element** pinpoints the JSX that produces it. Add it whenever you can — reviewers click through.
- **Frame layout on the flow canvas (Figma-style):** the renderer paints every frame at once with arrows between them, so reviewers see the whole user journey in one view. Two options:
  - **Recommended for linear flows:** omit `canvasX/canvasY` on every frame. The renderer auto-lays out frames left-to-right by walking the transition graph; branches fan vertically.
  - **Explicit positioning** when the journey forks dramatically or you want a specific spatial story: set `canvasX/canvasY` (top-left of each frame on the canvas). Leave 80-120 px of gutter between adjacent frames.
- **`transitions[]` is REQUIRED whenever you emit more than one frame.** Connect every consecutive pair (and any branches/loops). A two-frame mockup with no transition reads as "two unrelated screens" — always wire them up.
- **`trigger` must be SHORT (≤24 chars).** It's a label on a tiny arrow, not a sentence. Good: `"click Login"`, `"SSO succeeds"`, `"form valid"`, `"401 — token expired"`, `"esc / outside click"`. Bad: `"success → /api/auth/me redirects to /workflow"`. Save the prose for the step's `body`; keep the trigger to a verb + noun.
- **`fromSide`/`toSide` on a transition** are optional anchor hints (`top`/`right`/`bottom`/`left`). Use when the auto-anchor (relative position) crosses through another frame; otherwise leave unset.
- **Read the JSX before designing the mockup.** Tailwind classes carry spatial info (`flex-col`, `gap-2`, `w-64`, `text-sm`, etc.). Don't hallucinate elements that aren't in the diff; if a screen exists outside the diff but the change references it (e.g., an SSO provider's login page), model its key landmarks (logo, fields, submit button) without speculating on details.

## User journey — required for UI changes
- **If the PR touches user-facing UI** (new screens, new flows, modified interactions, new buttons/forms/dialogs, navigation changes), include a dedicated **"User journey"** chapter. Place it early — after the overview docs step but before the implementation chapters — so the reviewer understands the user-visible behaviour before diving into code.
- The chapter must contain at least one **diagram step** that visualises the journey. Pick the kind that fits the change:
  - Use `'mockup'` when the PR adds or rearranges *visual layout* — new screens, modals, forms, redesigned panels. The mockup is a Figma-style flow of wireframe frames connected by labeled arrows; reviewers see what the user sees. See the "UI Mockups" section above for the grammar.
  - Use `'sequence'` for diagrams that show the user interacting with the UI and the UI making backend calls (actor: User → UI → API → DB). Best when the change is about request/response flow, auth handshakes, or multi-system interactions.
  - Use `'flowchart'` for diagrams that show the user's decision path *without* visual layout detail (click X → see Y → click Z → land at W). Best for high-level branching UX where the screens themselves aren't the story.
  - Use multiple diagram steps when the journey has both — e.g., a `'mockup'` showing the new modal, plus a `'sequence'` showing the API call it fires.
- The diagram's `body` must read like a guided tour: "The user clicks **Submit review**, which fires `POST /api/reviews/...`. On success they see the new badge; on failure they see the inline error and the draft list remains." Don't restate the diagram — narrate the *user-visible* consequence of each transition.
- Follow the diagram with 1–3 `'code'` steps that pin the components / handlers driving the key transitions (e.g., the click handler, the loading state, the success/error rendering). Each step's body should answer "what does the user actually see at this moment, and what triggered it?".
- If the PR has multiple distinct flows (e.g., onboarding + settings change), give each its own diagram step inside the same User journey chapter.
- **Skip this chapter only when the PR has zero user-facing behaviour change** (pure refactor, backend-only change with no API contract impact, internal tooling). When in doubt, include it.

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
