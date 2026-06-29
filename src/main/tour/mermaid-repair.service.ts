import * as os from 'node:os'
import type { CliRunnerService } from '@/main/tour/cli-runner.service'
import { Service } from '@/main/service'

export interface MermaidRepairInput {
  source: string
  error: string
  signal?: AbortSignal
}

export interface MermaidRepairResult {
  source: string
}

const REPAIR_MODEL = 'claude-haiku-4-5-20251001'
const REPAIR_PROMPT = `You are a Mermaid syntax repair tool.

Below is Mermaid diagram source that fails to parse, along with the parser's error message. Fix the syntax so it parses cleanly while preserving the diagram's intent — same nodes, edges, labels, and semantics. Edit only what's broken.

Rules:
- Return ONLY the corrected Mermaid source on stdout. No markdown fences, no commentary, no explanation, no JSON envelope.
- Start your output with the diagram type keyword the original used (graph / flowchart / sequenceDiagram / classDiagram / erDiagram / stateDiagram-v2 / etc.).
- Keep original node ids, labels, and structure where possible.
- If the source is too damaged to repair confidently, output the original source verbatim.

Parser error:
{ERROR}

Source:
{SOURCE}
`

/**
 * One-shot Mermaid syntax repair via the local Claude CLI. Used by the
 * MermaidPane error retry button — the chat / tour answer holds an invalid
 * diagram source that broke the parser; this service asks a cheap model to
 * fix it without touching files or the web.
 *
 * In-memory only: the repaired source is returned to the caller, never
 * persisted. Reloading the message / step shows the original broken source.
 */
export class MermaidRepairService extends Service {
  constructor(private readonly cli: CliRunnerService) {
    super()
  }

  async repair(input: MermaidRepairInput): Promise<MermaidRepairResult> {
    if (!input.source.trim()) throw new Error('Cannot repair empty Mermaid source')
    const prompt = REPAIR_PROMPT.replace(
      '{ERROR}',
      input.error.trim() || '(none provided)',
    ).replace('{SOURCE}', input.source)
    const signal = input.signal ?? new AbortController().signal
    this.logger.info('Repairing Mermaid', {
      sourceBytes: input.source.length,
      errorPreview: input.error.slice(0, 120),
    })
    const result = await this.cli.run({
      prompt,
      provider: 'claude',
      model: REPAIR_MODEL,
      cwd: os.tmpdir(),
      signal,
      allowedTools: [],
    })
    const fixed = extractMermaid(result.raw)
    if (!fixed) throw new Error('Repair returned empty source')
    return { source: fixed }
  }
}

/**
 * Pull a Mermaid source out of the model's raw output. Tolerates a single
 * leading code fence, a trailing closing fence, and any leading narrative
 * the model may emit despite the prompt's "no commentary" rule.
 */
function extractMermaid(raw: string): string {
  const fenced = raw.match(/```(?:mermaid)?\s*\n([\s\S]*?)\n```/i)
  const captured = fenced?.[1]
  return (captured ?? raw).trim()
}
