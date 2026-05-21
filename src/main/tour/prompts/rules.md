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
- For visual layout of new screens / modals / dialogs / forms / wizards, use the **'mockup'** diagram kind — see the "UI Mockups" section below.
- For finite-state logic (autosave / retry / polling / wizards / async upload phases), use the **'state'** diagram kind — see the "State Diagrams" section below. This is REQUIRED when the PR adds or substantially changes such logic.
- **Mermaid text hygiene** — Mermaid treats `;` as a top-level statement separator, so it CANNOT appear inside `note over X: …` text or any other free-text label (it breaks the parse). Use `,` or `<br/>` instead. Similarly avoid stray `++` / `--` inside labels (they are activation/deactivation syntax). Keep label text plain and short.

## UI Mockups (diagram.kind = 'mockup')
The `mockup` diagram kind is a structured JSON wireframe (not Mermaid). It renders as a Figma-style flow: every frame laid out on one pannable canvas with labeled arrows between them. Use it when the PR adds or substantially changes screens, modals, forms, or multi-step flows — the user-visible *shape*, not the call graph.

- **When to emit:** at least one mockup step inside the User journey chapter when the PR introduces new UI or rearranges existing screens. Pure backend / refactor PRs skip mockups entirely.
- **Step 1 — enumerate every distinct user journey** the PR introduces or substantially changes BEFORE you start drafting frames. Different journeys = different entry actors or different start screens. Write the full list down in your head before touching frames. Example PRs and their journey lists:
  - A sprint-management PR might have **3 journeys**: (a) operator clears a blocked item, (b) supervisor self-resolves an item, (c) automation auto-resolves at the 3-day mark.
  - A checkout-redesign PR might have **2 journeys**: (a) returning customer with saved card, (b) new customer entering card details.
  - A single-form PR usually has **1 journey** with multiple branches (pristine → typing → submitting → success/error).
- **Step 2 — for EACH journey, enumerate every branch from entry to terminal state.** A branch is "complete" only when it reaches a terminal state: submit-success, dismiss/cancel, route-away to another page, or an error-terminal the user can't recover from. Walk the diff and enumerate per journey:
  - Every conditional render path (`isLoading ? <Skeleton /> : isError ? <Error /> : data.length === 0 ? <Empty /> : <List />` → 4 frames: loading, error, empty, populated).
  - Every modal / dialog / drawer / popover / tooltip the change introduces or modifies (each is its own frame; `open` vs `closed` are two frames).
  - Every redirect target in an auth / SSO / multi-step flow (`/login` → external IdP → callback → `/dashboard` → 4 frames).
  - Every distinct success / failure / retry / pending state (`200 → success view`, `4xx → inline error`, `5xx → toast + retry button` → 3 frames).
  - Every role-gated or feature-flagged variant of the same screen (admin vs member view → 2 frames).
  - Every form-validation state shown in the JSX (pristine, typing, valid, invalid-with-error-message — usually 2-4 frames if the diff touches validation).
- **Step 3 — MANDATORY: one mockup step per journey, no merging.** Every distinct journey identified in Step 1 MUST get its own `kind: 'mockup'` step in the User journey chapter — no exceptions. A 3-journey PR produces **exactly 3** mockup steps; a 5-journey PR produces **exactly 5**. The step's `body` opens with the journey's name so reviewers know which one they're looking at. **Skipping a journey because "the diff is long" / "frames are similar" / "feels redundant" is a defect.** If two journeys share most frames, they still get two steps — call out the divergence point in each `body`.
- **`mockup.frames[]` — one frame per visual state the user actually sees within THIS journey.** If the user's eyes see a different layout, it's a new frame. Don't collapse intermediate states into a "before / after" pair — the in-between frames are usually the most informative for a reviewer. The 8-frame cap is **per step**; if a single journey legitimately needs more than 8 frames, prioritise entry → terminal coverage and merge cosmetically-similar intermediate states (e.g., "typing valid" + "typing invalid" share a layout and can be one frame with a note in `body`). Don't merge across branches.
- **Self-audit before you finish the User journey chapter — do all four or the chapter is incomplete:**
  1. Re-read your Step 1 journey list. Count the journeys: _N_.
  2. Count the `kind: 'mockup'` steps you've written in this chapter: _M_.
  3. If _M_ < _N_, **stop and add the missing mockup step(s)** for every journey from your list that doesn't already have one. Do not move on to the next chapter with _M_ < _N_.
  4. For each mockup step, trace `transitions[]` from the entry frame to every terminal frame. If a branch (e.g., the "401 expired" path) has no edges leading into it, you missed wiring it up — fix it before emitting.
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

## State Diagrams (diagram.kind = 'state')
The `state` diagram kind renders an XState v5-shaped machine config as a labeled state-transition graph: states as boxes, transitions as arrows with `event [cond] / actions` labels. Use it when the PR adds or changes finite-state logic — the *named phases* the code progresses through, not the call graph.

- **When to emit (REQUIRED):** if the PR adds or changes any of these, the User journey chapter (or a dedicated "Logic" chapter when the change is purely internal) MUST include a `kind: 'state'` step:
  - A reducer or state union with 3+ named phases transitioning via discrete events (`type State = 'idle' | 'saving' | 'saved' | 'error'`)
  - A polling loop with idle / polling / error / backoff phases
  - An autosave controller, draft manager, optimistic-mutation controller, or upload manager with named phases
  - A multi-step wizard / form with back-and-forward transitions
  - Any retry / cooldown / circuit-breaker logic
- **When NOT to emit:** linear API calls without persisted state, two-state toggles (just describe in prose), pure decision trees without state — use `'sequence'` or `'flowchart'` instead.
- **Cover EVERY variation present in the diff.** Before writing the machine, walk the diff and enumerate:
  - Every value of the state union / discriminator — each becomes a key in `states`. If the type is `'idle' | 'saving' | 'recovering' | 'committed' | 'failed' | 'giveUp'`, the machine has six states; missing any is a bug.
  - Every `case` arm of the reducer / switch — each becomes a transition. If a state handles `SAVE | RETRY | RESET | OTHER_ERROR`, all four belong on its `on` map.
  - Every guard condition seen in the diff (`if (attempt < MAX_RETRIES)`, `if (response.status === 409)`) — encode as `cond` on the relevant transition. Don't collapse a guarded branch into the unguarded one.
  - Every side effect / dispatch / setter on entry, exit, or during transitions — encode as `entry` / `exit` / `actions` (verb-noun, ≤6 per slot).
  - Every terminal state (the reducer returns no further transitions, the controller resolves / unmounts) — mark with `type: 'final'`.
  - Every loop / retry edge (`error → saving on RETRY`) and reset edge (`error → idle on RESET`) — these are usually the most informative for a reviewer; do not omit them.
- **Completeness check before emitting:** count the `case`s in the diff vs the transitions in your machine; count the state-union members vs the keys in `states`. If they don't match, re-read the diff and add the missing pieces.
- **`id`** — kebab or camelCase machine name (≤80 chars). Use the code's identifier when it has one (`autosaveMachine`); otherwise pick something descriptive (`upload-state`).
- **`initial`** — the starting state's local name. MUST exist as a key in `states`. The renderer marks it with a small entry dot.
- **`states`** — map of state name → StateNode. State names are short and code-aligned (`idle`, `saving`, `saved`, `error`).
- **Each StateNode** can carry:
  - `entry` / `exit` — short action descriptions (`"snapshot draft"`, `"clear draft"`, `"show toast"`). Strings or arrays of strings. ≤6 each.
  - `on` — event-name → transition map. Event names are SCREAMING_SNAKE (`SAVE`, `SUCCESS`, `FAILURE`, `RETRY`, `RESET`).
  - `type: 'final'` for terminal states (renderer draws a double border).
  - `type: 'compound'` (or just nested `states` + `initial`) for sub-machines.
- **Transitions** can be a target name (string shorthand `"saving"`) OR a full object `{ target, cond?: string, actions?: string[], source? }`.
- **`cond`** is a human-readable guard description (`"payload valid"`, `"retries < 3"`). NOT executable code — the renderer just shows it inside the brackets in the arrow label.
- **`actions`** are short verb-noun phrases (`"save draft"`, `"increment retries"`, `"show error toast"`). ≤6 per transition.
- **`source: "<repo-relative path>:<lineStart>-<lineEnd>"`** on states AND transitions enables click-to-jump. Attach it whenever you can — reviewers click through to the reducer / handler that drives the transition.
- **Keep machines small: 3-8 states is the sweet spot.** If a flow naturally needs more, split into multiple machines (one per concern) and emit separate `state` steps in the same chapter — reference the split in `body`.

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

## Backend chapter diagrams — required for backend changes

When a chapter covers a backend change — new / changed DB tables, new / changed
HTTP / RPC / GraphQL endpoints, new domain models, new request flows — that
chapter MUST include the relevant diagram step(s) AND structured docs steps.
Diagrams and structured tables are the high-bandwidth way to convey backend
shape; missing them makes the chapter much harder to review.

**Triggers** — apply when the chapter discusses ANY of:

- A migration that adds / drops / alters tables, columns, or indexes
  (`*.sql`, `migrations/*`, Prisma / Alembic / Flyway / Liquibase, ORM
  model files that change schema).
- A new or modified HTTP / RPC / GraphQL endpoint (route handler,
  controller method, schema file, `.proto`, OpenAPI spec).
- A new or substantially modified domain class / DTO with non-trivial
  fields or relationships to other domain classes.
- A new or substantially changed request flow that crosses ≥ 2 service
  / repository boundaries.

**Every backend chapter MUST emit at least one diagram step.** Skipping
diagrams because "the change is small" or "the code is self-explanatory" is
a defect — backend changes are always worth visualising for the reviewer.
Pick the kinds that match the change; most backend chapters emit 2–3:

- `kind: 'sequence'` (sequenceDiagram) — **MANDATORY for every chapter that
  touches a controller / route handler / service / repository / DAO**, even
  if the change feels small. This is the end-to-end request lifecycle the
  reviewer needs to see. Show the full path:
  `Client → Controller → (validation / auth) → Service → Repository → DB`
  and the response path back. Include external calls (`External API`,
  message queue, cache) when they're hit. Use actors `Client`, `Controller`,
  `Service`, `Repository`, `DB`, `External`. Keep ≤ 12 messages — collapse
  internal helper calls into a single message when needed. If the chapter
  covers multiple endpoints, emit one sequence step per endpoint (or merge
  when the flows are 90% identical, with a note in `body`).
- `kind: 'er'` (erDiagram) — **REQUIRED** when the chapter covers a new or
  altered table. Show the new table with its columns + FK relationships to
  existing tables. Existing tables appear as referenced nodes only (no full
  field list). Cap ~8 nodes.
- `kind: 'class'` (classDiagram) — **REQUIRED** when the chapter introduces
  a new domain class with ≥ 3 fields OR a relationship to another domain
  class. Include fields with types, methods (where meaningful), and edges
  with 1:1 / 1:N / N:M cardinality. Cap ~12 nodes.
- `kind: 'flowchart'` (flowchart TD) — use for branching backend workflows
  (validation pipelines, retry / fallback logic, multi-step background
  jobs, error-recovery paths). Also use for **timing diagrams** — emit
  `flowchart LR` with nodes labelled `t0`, `t1`, … showing the order of
  operations and any concurrency / serialisation (e.g., "fetch user +
  fetch settings happen in parallel; both must resolve before mapping").
- `kind: 'state'` (stateDiagram-v2 via the `state` kind — see "State
  Diagrams" above) — **REQUIRED** when the chapter describes finite-state
  logic in the backend (job lifecycle, async upload phases, state machine
  driven by webhooks).

**Required docs steps — one concern per step, do NOT cram.** Each item below
is its own `panel: 'docs'` step. A chapter that introduces 4 endpoints
emits, AT MINIMUM, 4 docs steps (one OpenAPI per endpoint) PLUS the
permission step PLUS the AM→SM step — not "permission + 4 OpenAPI + AM→SM
crammed into one body". The model's tendency is to merge these into a
single 1.5k-char docs step; that truncates and silently drops items. **Do
not merge.**

- **OpenAPI snippet step (REQUIRED, one step per new / changed endpoint).**
  `panel: 'docs'`, title `"OpenAPI · <METHOD> <route>"`, body is a single
  `` ```yaml `` fenced block emitting an OpenAPI 3.1 fragment covering
  `paths.<route>.<method>.{requestBody, responses, parameters, security}`.
  Use repo-conventional schema names; `$ref` external schemas if any. **One
  endpoint per step — do not stack endpoints into the same fence.** A
  3-endpoint chapter emits 3 OpenAPI steps.
- **Request / response structure-table step (REQUIRED, one step per new /
  changed endpoint).** Two markdown tables per endpoint:
  `| field | type | required | notes |` — one for the request body, one for
  the response. Add a third table for URL / query params when present.
  Title `"Shapes · <METHOD> <route>"`. **Do not omit the response table.**
- **Permission summary step (REQUIRED when the chapter covers ≥ 1 endpoint
  with an auth guard).** Single docs step with a markdown table:
  `| endpoint | method | guard | scope | notes |`. The "guard" column names
  the decorator / middleware / inline check (`@PreAuthorize`,
  `requireAuth()`, `Depends(get_current_user)`, etc.). Title `"Permissions"`.
- **AM → SM mapping step (REQUIRED when ≥ 1 endpoint maps an API DTO into
  a service-layer model).** One step. Title `"AM → SM mapping"`. Markdown
  table per mapping site: `| API field | SM field | mapping | notes |`.
  "mapping" is one of: `direct`, `cast`, `enum-parse`, `default-applied`,
  `null-coalesced`, `lossy`. Show the mapping site as `file:line` in the
  surrounding prose. **Emit a row group per endpoint that has a mapping.**
  Skipping endpoints because they look similar to one already covered is a
  defect.

**Composition rules — endpoint chapters MUST decompose.**

The default shape for any chapter covering ≥ 1 endpoint:

1. Brief docs step (chapter overview, 2–4 sentences).
2. Permission summary docs step (if any endpoint has auth).
3. AM → SM mapping docs step (if any endpoint maps DTOs into SM).
4. ONE OpenAPI docs step PER endpoint.
5. ONE shapes docs step PER endpoint (request + response tables).
6. One sequence diagram step (`kind: 'sequence'`) showing the request
   lifecycle. Multiple endpoints can share one diagram if flows are 90%+
   identical; otherwise emit one per endpoint.
7. Code steps pinning the controller / service / repository implementations.

A 3-endpoint chapter is therefore 1 (overview) + 1 (permissions) + 1
(AM→SM) + 3 (OpenAPI) + 3 (shapes) + 1 (sequence) + N (code) ≈ 10–15
steps. **Do not collapse this into 3 steps.** If you find yourself writing
a docs step longer than ~1500 characters, you are cramming — split it.

Other composition rules:

- One concept per step — don't bundle the ER diagram and the class diagram
  into one step.
- A diagram-only step still needs a non-empty `body` introducing what the
  diagram shows.
- Skip a kind cleanly if its trigger isn't met. Pure handler-tweak PRs
  don't need a class diagram; backend PRs without auth don't need a
  permission table.

**Self-audit before closing each backend chapter — STOP and re-emit if any
answer is "missing":**

Walk this list out loud (in your head) at the end of each chapter, BEFORE
writing the closing `}`:

1. **Endpoints in this chapter?** For each one I count, is there:
   - exactly one OpenAPI step? (yes / missing)
   - exactly one shapes step? (yes / missing)
2. **Auth guard mentioned in this chapter?** → Permission summary step
   present? (yes / missing)
3. **DTO → service model conversion in this chapter?** → AM → SM mapping
   step present? (yes / missing)
4. **Touched a controller / route handler / service / repository / DAO?**
   → `kind: 'sequence'` step present? (yes / missing)
5. **Touched a migration / DB schema?** → `kind: 'er'` step present?
   (yes / missing)
6. **New domain class with non-trivial structure?** → `kind: 'class'` step
   present? (yes / missing)
7. **Touched state-machine / lifecycle logic?** → `kind: 'state'` step
   present? (yes / missing)

If ANY answer is "missing", **stop, go back, and add the step**. Do not
proceed to the next chapter with a missing required step. The most common
failure mode is the model assuming "I'll bundle this with the next thing"
— that bundling never happens. Emit each step now, individually.

**Anti-goal:** these diagrams + tables live on the tour (descriptive). The
review pass is for *critique* — gaps, drift, anti-patterns. Don't mirror
the table here in the review pass.

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

## Final pass — file-coverage self-audit (REQUIRED before emitting)

Before you write the closing `]` of the JSON array, run this audit silently. The single most common failure of this prompt is dropping files from the diff — the validator rejects the output and the user pays for a full retry (~$1+). The audit takes seconds. Don't skip it.

1. **Re-read the "Changed files" list** from the PR context section above. That list is the authoritative set — every path on it MUST appear somewhere in your tour.
2. **Walk the list path by path.** For each path, identify the single step that owns it:
   - Either some step has `code.file === <path>` (the file is *pinned* to that step), OR
   - some step has `<path>` in its `references[]` array (the file is *mentioned* by that step).
3. **If any path has neither, you have a coverage gap. Stop and fix it now**, before emitting the closing `]`. Two ways to fix:
   - Add the path to `references[]` of the most-related existing step. The "Supporting changes" / final chapter is the default landing zone for trivia (tests, lockfiles, generated assets, config tweaks); add the path there with a one-line mention in the step's `body`.
   - If the path genuinely deserves its own step (substantive change you missed), add the step to the appropriate chapter.
4. **Common drop categories — check these explicitly:**
   - Service-layer model classes / DTOs that mirror domain models (e.g., `SM*.kt`, `*Dto.java`, `*Model.ts`). Easy to skip because they're "boring scaffolding" — they still need coverage.
   - Mapper / converter files that pair with the models above.
   - Test fixtures, factory files, seed data.
   - Generated files (codegen output, compiled schemas, lockfiles).
   - Config tweaks (yaml, env templates, build files).
   - Files whose diff is small (`+1/-1`, renames, formatting-only churn).
5. **Do not narrate the audit in step bodies.** It is silent. If a file landed in `references[]` as a result of the audit, its mention can be one line — "Tests covering the above" / "Generated schema bindings" / "Supporting config change" — but you must mention it. A bare reference with no body context is still better than dropping the file.

If your final count of unique paths across all `code.file` + `references[]` doesn't equal the count of files in the "Changed files" list, the audit hasn't passed. Re-run it.
