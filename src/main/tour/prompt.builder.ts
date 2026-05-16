import prContextTemplate from '@/main/tour/prompts/pr-context.md?raw'
import retryHintTemplate from '@/main/tour/prompts/retry-hint.md?raw'
import rules from '@/main/tour/prompts/rules.md?raw'
import schemaReference from '@/main/tour/prompts/schema-reference.md?raw'
import { template } from '@/main/lib/template'
import type { PrContext } from '@/main/tour/pr-context.collector'
import { Service } from '@/main/service'

/**
 * Builds the LLM prompt that produces a chapters-shaped tour by assembling
 * four markdown fragments — three static (`schema-reference`, `rules`) and
 * one dynamic (`pr-context`) — plus an optional retry hint when an earlier
 * generation failed validation. Editing the prompt itself means editing the
 * .md files, not this assembler.
 */
export class PromptBuilder extends Service {
  build(ctx: PrContext, retryHint?: string): string {
    const sections = [template(prContextTemplate, this.contextVars(ctx)), schemaReference, rules]
    if (retryHint) sections.push(template(retryHintTemplate, { reason: retryHint }))
    return sections.join('\n\n').trim()
  }

  private contextVars(ctx: PrContext): Record<string, string | number> {
    return {
      title: ctx.title,
      body: ctx.body || '(empty)',
      files: formatFiles(ctx.files),
      commits: formatCommits(ctx.commits),
      diff: ctx.diff,
      diffBytes: ctx.diffBytes,
      diffTruncatedNote: ctx.diffTruncated ? ', truncated' : '',
    }
  }
}

function formatFiles(files: PrContext['files']): string {
  return files.map((f) => `- ${f.path}  +${f.additions} -${f.deletions}`).join('\n')
}

function formatCommits(commits: PrContext['commits']): string {
  return commits.map((c) => `- ${c.sha.slice(0, 7)} ${c.subject}`).join('\n')
}
