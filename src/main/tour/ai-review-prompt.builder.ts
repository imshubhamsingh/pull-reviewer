import reviewContextTemplate from '@/main/tour/prompts/review-context.md?raw'
import reviewRules from '@/main/tour/prompts/review-rules.md?raw'
import reviewSchemaReference from '@/main/tour/prompts/review-schema-reference.md?raw'
import { template } from '@/main/lib/template'
import type { PrContext } from '@/main/tour/pr-context.collector'
import type { Tour } from '@/main/tour/tour-schema'
import { Service } from '@/main/service'

/**
 * Builds the AI-review prompt. Same assembly shape as `PromptBuilder` —
 * three markdown fragments + a context template. `tour` is OPTIONAL:
 * when null (review running in parallel with tour-gen), the
 * `{{tourSummary}}` slot fills in a "running in parallel" note and the
 * model works from the diff alone.
 */
export class AiReviewPromptBuilder extends Service {
  build(ctx: PrContext, tour: Tour | null): string {
    const sections = [
      template(reviewContextTemplate, this.contextVars(ctx, tour)),
      reviewSchemaReference,
      reviewRules,
    ]
    return sections.join('\n\n').trim()
  }

  private contextVars(ctx: PrContext, tour: Tour | null): Record<string, string | number> {
    return {
      title: ctx.title,
      body: ctx.body || '(empty)',
      files: formatFiles(ctx.files),
      diff: ctx.diff,
      diffBytes: ctx.diffBytes,
      diffTruncatedNote: ctx.diffTruncated ? ', truncated' : '',
      tourSummary: tour
        ? formatTourSummary(tour)
        : '(running in parallel with tour generation; work from the diff alone)',
    }
  }
}

function formatFiles(files: PrContext['files']): string {
  return files.map((f) => `- ${f.path}  +${f.additions} -${f.deletions}`).join('\n')
}

function formatTourSummary(tour: Tour): string {
  return tour
    .map((chapter, idx) => {
      const lines = [`## Chapter ${idx + 1}: ${chapter.title}`]
      if (chapter.summary) lines.push(`  ${chapter.summary}`)
      for (const step of chapter.steps) {
        const pin = step.code?.file ? ` — ${step.code.file}` : ''
        lines.push(`  - ${step.title}${pin}`)
      }
      return lines.join('\n')
    })
    .join('\n\n')
}
