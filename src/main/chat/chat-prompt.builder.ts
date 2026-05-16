import prContextTemplate from '@/main/chat/prompts/pr-context.md?raw'
import systemPrompt from '@/main/chat/prompts/system.md?raw'
import tourSummaryTemplate from '@/main/chat/prompts/tour-summary.md?raw'
import { template } from '@/main/lib/template'
import type { PrChatMessageRecord } from '@/main/chat/chat.store'
import type { PrContext } from '@/main/tour/pr-context.collector'
import type { TourRecord } from '@/main/tour/tour.store'
import { Service } from '@/main/service'

export interface BuildArgs {
  ctx: PrContext
  tour: TourRecord | undefined
  history: PrChatMessageRecord[]
  newMessage: string
}

/**
 * Assembles the chat prompt as a single text blob fed to the Claude CLI.
 *
 *   <system>
 *   <PR context: title/body/files/diff>
 *   <tour summary>           (if a tour exists)
 *   <conversation history>   (bounded by chat.history.budget)
 *   <new user message>
 *
 * The CLI is invoked with `-p <prompt>` so the whole thing is the user turn.
 * Multi-turn conversation history is replayed inline so claude has the
 * context it needs for follow-ups without us managing session state.
 */
export class ChatPromptBuilder extends Service {
  build(args: BuildArgs): string {
    const sections: string[] = [
      systemPrompt,
      template(prContextTemplate, this.contextVars(args.ctx)),
    ]
    if (args.tour)
      sections.push(template(tourSummaryTemplate, { tourSummary: renderTourSummary(args.tour) }))
    if (args.history.length > 0) sections.push(renderHistory(args.history))
    sections.push(`# Reviewer's question\n${args.newMessage}`)
    return sections.join('\n\n').trim()
  }

  private contextVars(ctx: PrContext): Record<string, string | number> {
    return {
      title: ctx.title,
      body: ctx.body || '(empty)',
      files: formatFiles(ctx.files),
      diff: ctx.diff,
      diffBytes: ctx.diffBytes,
      diffTruncatedNote: ctx.diffTruncated ? ', truncated' : '',
    }
  }
}

function formatFiles(files: PrContext['files']): string {
  return files.map((f) => `- ${f.path}  +${f.additions} -${f.deletions}`).join('\n')
}

/**
 * Renders the tour as a compact chapter+step outline (no full bodies). Enough
 * for the model to know what the user has already seen without bloating the
 * prompt.
 */
function renderTourSummary(tour: TourRecord): string {
  return tour.chapters
    .map((chapter, i) => {
      const head = `## Chapter ${i + 1}: ${chapter.title}${chapter.summary ? ` — ${chapter.summary}` : ''}`
      const steps = chapter.steps
        .map((s) => `  - ${s.title}${s.code ? ` (${formatCodeRef(s.code)})` : ''}`)
        .join('\n')
      return `${head}\n${steps}`
    })
    .join('\n\n')
}

function formatCodeRef(code: { file: string; lineStart?: number; lineEnd?: number }): string {
  if (code.lineStart == null) return code.file
  const range =
    code.lineEnd != null && code.lineEnd !== code.lineStart
      ? `${code.lineStart}-${code.lineEnd}`
      : String(code.lineStart)
  return `${code.file}:${range}`
}

function renderHistory(messages: PrChatMessageRecord[]): string {
  const lines: string[] = ['# Conversation so far']
  for (const m of messages) {
    const tag = m.role === 'user' ? '## Reviewer' : '## Assistant'
    lines.push(`${tag}\n${m.body}`)
  }
  return lines.join('\n\n')
}
