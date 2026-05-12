# pull-reviewer

Desktop GitHub PR manager with LLM-narrated tours of every PR.

## What it does

- Lists your open PRs and review requests across all repos via the GitHub API
- Generates a **living documentation tour** of any PR — a step-by-step narrated walkthrough produced by the `claude` or `codex` CLI you already have logged in
- Renders the tour with an in-app viewer (built in-house)

## Prerequisites

- Node 22+
- The `gh` CLI, signed in: `gh auth login`
- One of:
  - The `claude` CLI on your `$PATH` (default), or
  - The `codex` CLI on your `$PATH`

The app shells out to `gh` for auth and PR data, and to `claude` / `codex` for tour generation — no API keys are stored in the app.

## Run

```sh
npm install
npm start
```

## Architecture

Class-based, no DI framework, manual composition root.

```
src/
  main.ts                          Electron entry, app lifecycle
  preload.ts                       contextBridge
  renderer.tsx                     React entry
  app/App.tsx                      Renderer UI
  lib/
    logger.ts                      child-loggable JSON logger
    ipc/channels.ts                IPC channel constants
  main/
    service.ts                     base Service class (injects logger)
    build-services.ts              composition root — manual `new`s
    server.ts                      Hono app, mounts routers
    auth/
      auth.service.ts              `gh auth token` reader
    github/
      github-cli.service.ts        `gh` shell wrapper
      pull-request.service.ts      Octokit GraphQL list
      pull-request.router.ts       Hono routes
    tour/
      pr-context.collector.ts      PR diff + files + commits
      prompt.builder.ts            assembles the LLM prompt
      cli-runner.service.ts        spawns claude / codex
      tour.parser.ts               unwraps + zod-validates output
      tour.service.ts              orchestrator
      tour.router.ts               Hono routes
```

### Conventions

- File names: `kebab-case.<role>.ts` where role ∈ `service`, `router`, `collector`, `builder`, `parser`
- Class name `PascalCase` matches file (`tour.service.ts` → `TourService`)
- One export per file; co-locate router + service in the same feature folder
- Every class extends `Service` for a per-class child logger
- Constructor injection only; no DI container, no decorators
- `private readonly` for injected deps
- Every public method logs entry (key inputs) and a meaningful exit
- Routers are thin: they map HTTP → service method and translate errors

### Backend

- **Hono** runs inside the Electron main process via `@hono/node-server` on a random port
- Renderer fetches the port over IPC (`app:get-api-port`) once, then uses plain `fetch`
- Mutations and detail reads go through Hono; bootstrap goes through IPC

## API

All routes are mounted at `http://localhost:<port>`; the renderer reads the port over IPC.

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET`  | `/health` | — | `{ ok: true }` |
| `GET`  | `/api/pull-requests/mine` | — | `PullRequestSummary[]` |
| `GET`  | `/api/pull-requests/review-requested` | — | `PullRequestSummary[]` |
| `POST` | `/api/tours/:repoOwner/:repoName/:prNumber/generate` | `{ provider?: 'claude'\|'codex', model?: string }` | `TourResult` |

## Tour generation

1. `PrContextCollector` runs `gh pr view --json title,body,files,commits,headRefOid` and `gh pr diff`, truncating to 60 KB.
2. `PromptBuilder` assembles a strict prompt asking for a JSON `TourStep[]`.
3. `CliRunnerService` spawns `claude -p --output-format json --allowedTools ""` or `codex exec - --json --sandbox read-only --ask-for-approval never`. Tools are disabled — we want a pure transform.
4. `TourParser` unwraps the `{ result: "..." }` envelope, strips fences, and zod-validates the array.
5. `TourService.generate()` returns `{ steps, headRefOid, generatedAt }`.

Cancellation is via `AbortSignal` plumbed from the HTTP request through to the spawned process.

## Roadmap

- [ ] SQLite cache (drizzle) keyed by `(prId, headRefOid)` so tours regenerate only on new commits
- [ ] Background syncer (polling, ETag, rate-limit broker)
- [ ] `TourView` rendering (custom, in-house)
- [ ] Author-authored `.tour.md` as an alternative source
- [ ] Stacked-PR detection
