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
export type CliEvent =
  | { type: 'tool_call'; name: string; input: unknown }
  | { type: 'partial_text'; text: string }
  | { type: 'final'; raw: string; costUsd?: number; durationMs?: number; usage?: TokenUsage }

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
}
