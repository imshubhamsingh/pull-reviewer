import type { PrContext } from '@/main/tour/pr-context.collector'
import { Service } from '@/main/service'

export class PromptBuilder extends Service {
  build(ctx: PrContext): string {
    const files = ctx.files
      .map((f) => `- ${f.path}  +${f.additions} -${f.deletions}`)
      .join('\n')

    const commits = ctx.commits
      .map((c) => `- ${c.sha.slice(0, 7)} ${c.subject}`)
      .join('\n')

    return `You generate JSON tour scripts for code review.

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
${commits}

Output ONLY a JSON array matching this TypeScript type. No prose, no fences.

type TourStep = {
  id: string                    // stable kebab-case
  panel: 'docs' | 'code' | 'code-map'
  file?: string                 // path from the diff
  side?: 'before' | 'after' | 'diff'
  lineStart?: number
  lineEnd?: number
  title: string                 // <60 chars
  body: string                  // markdown, 1-3 short paragraphs
}

Rules:
- 4-10 steps total. Start with a "docs" step that summarizes the change.
- Order steps so a reviewer can follow the data/control flow.
- Put tests and lockfile changes last.
- Don't invent files or line numbers not in the diff.`
  }
}
