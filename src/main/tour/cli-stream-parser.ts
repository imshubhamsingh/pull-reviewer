import type { CliEvent, TokenUsage } from '@/main/tour/cli-event'

export interface CliResultMeta {
  costUsd?: number
  durationMs?: number
  usage?: TokenUsage
}

/**
 * Stateful JSONL parser for `claude --output-format stream-json --verbose` output.
 *
 * Claude streams one JSON object per line. Lines we care about:
 *   - `{ type: 'assistant', message: { content: [...] } }` where content blocks
 *     may be `{ type: 'text', text }` or `{ type: 'tool_use', name, input }`
 *   - `{ type: 'result', result: '<final assistant text>' }` — the end
 *
 * We buffer partial lines (chunks don't align with newlines), emit `tool_call`
 * and `partial_text` events as they arrive, and at the end the caller asks for
 * `finalText()` — the full assistant message text that gets fed to TourParser.
 *
 * For codex (`--json` output, different shape), we degrade gracefully: each
 * line is emitted as a `partial_text` event so the user still sees activity.
 */
export class CliStreamParser {
  private lineBuffer = ''
  private accumulatedText = ''
  private resultMeta: CliResultMeta = {}

  /** Fires once per `{type:'result'}` event the parser sees — used by the
   * persistent chat-process manager to detect turn-end without scanning the
   * stream itself. Always undefined for the one-shot tour-gen path. */
  onResult: ((raw: string, meta: CliResultMeta) => void) | undefined

  feed(chunk: string, emit: (e: CliEvent) => void): void {
    this.lineBuffer += chunk
    const lines = this.lineBuffer.split('\n')
    this.lineBuffer = lines.pop() ?? ''
    for (const line of lines) this.handleLine(line, emit)
  }

  flush(emit: (e: CliEvent) => void): void {
    if (this.lineBuffer.length > 0) {
      this.handleLine(this.lineBuffer, emit)
      this.lineBuffer = ''
    }
  }

  finalText(): string {
    return this.accumulatedText
  }

  meta(): CliResultMeta {
    return this.resultMeta
  }

  private handleLine(line: string, emit: (e: CliEvent) => void): void {
    const trimmed = line.trim()
    if (!trimmed) return

    const event = tryParseJson(trimmed)
    if (!event) {
      // Unparseable line — fall back to emitting it as text so the user still
      // sees progress. Codex's format and partial buffer noise land here.
      emit({ type: 'partial_text', text: trimmed })
      return
    }

    this.handleEvent(event, emit)
  }

  private handleEvent(event: Record<string, unknown>, emit: (e: CliEvent) => void): void {
    const type = event.type

    if (type === 'assistant') {
      this.handleAssistant(event, emit)
      return
    }

    if (type === 'result') {
      this.handleResult(event)
      return
    }

    // Other system / lifecycle events (init, message_start, etc.) — ignore.
  }

  private handleResult(event: Record<string, unknown>): void {
    if (typeof event.result === 'string') this.accumulatedText = event.result
    if (typeof event.total_cost_usd === 'number') this.resultMeta.costUsd = event.total_cost_usd
    if (typeof event.duration_ms === 'number') this.resultMeta.durationMs = event.duration_ms
    if (isRecord(event.usage)) this.resultMeta.usage = readUsage(event.usage)
    this.onResult?.(this.accumulatedText, this.resultMeta)
  }

  private handleAssistant(event: Record<string, unknown>, emit: (e: CliEvent) => void): void {
    const message = event.message as { content?: unknown[] } | undefined
    const content = message?.content
    if (!Array.isArray(content)) return

    for (const block of content) {
      if (!isRecord(block)) continue
      if (block.type === 'text' && typeof block.text === 'string') {
        this.accumulatedText += block.text
        emit({ type: 'partial_text', text: block.text })
      } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
        // Surface the model's reasoning so the user sees life during long
        // think windows. Don't accumulate into finalText — thinking isn't
        // part of the JSON answer.
        emit({ type: 'partial_text', text: block.thinking })
      } else if (block.type === 'tool_use' && typeof block.name === 'string') {
        emit({ type: 'tool_call', name: block.name, input: block.input ?? null })
      }
    }
  }
}

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readUsage(raw: Record<string, unknown>): TokenUsage | undefined {
  const inputTokens = numberOrZero(raw.input_tokens)
  const outputTokens = numberOrZero(raw.output_tokens)
  if (inputTokens === 0 && outputTokens === 0) return undefined
  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens: numberOrUndef(raw.cache_creation_input_tokens),
    cacheReadInputTokens: numberOrUndef(raw.cache_read_input_tokens),
  }
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

function numberOrUndef(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}
