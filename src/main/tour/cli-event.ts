/**
 * Events the CLI runner emits while a tour is being generated.
 *  - `tool_call`: the model invoked a Read/Grep/Glob tool
 *  - `partial_text`: a chunk of assistant text was produced
 *  - `final`: the run completed; `raw` is the full assistant text (the JSON
 *    tour the TourParser then parses). Optional `costUsd` / `durationMs` /
 *    `usage` are present when the provider reports them (claude does; codex
 *    doesn't yet).
 *
 * Renderer-side, these stream over SSE so the user sees what the agent is
 * doing during the 60-120s of generation, and the final cost shows in the
 * tour viewer.
 */
/**
 * Identifies which parallel CLI stream an event belongs to. `tour` is the
 * chapter-emitting generation; `review` is the dedicated AI review pass.
 * Renderer-side, the generating panel splits into two columns keyed on
 * this tag. Phase events from GeneratedTourSource that are scope-neutral
 * (e.g. "Collecting PR context") use `tour` by convention.
 */
export type CliStream = 'tour' | 'review'

export type CliEvent =
  | { type: 'tool_call'; name: string; input: unknown; stream?: CliStream }
  | { type: 'partial_text'; text: string; stream?: CliStream }
  | {
      type: 'final'
      raw: string
      costUsd?: number
      durationMs?: number
      usage?: TokenUsage
      stream?: CliStream
    }
  /**
   * High-level progress marker emitted by GeneratedTourSource around its slow
   * steps (PR fetch, repo clone, model run, tour parse). Not produced by the
   * CLI itself — exists so the renderer can show what's happening during the
   * 30–60s windows before the model starts emitting tool calls.
   */
  | { type: 'phase'; name: string; detail?: string; stream?: CliStream }

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
}
