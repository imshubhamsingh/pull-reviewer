import { marked } from 'marked'
import { useMemo, type JSX } from 'react'
import { CritiqueCallout } from '@/app/components/CritiqueCallout'
import type { TourChapter, TourStep } from '@/lib/api'

interface Props {
  step: TourStep
  chapter: TourChapter
}

/**
 * Renders a step's narration plus its chapter critique (issues + suggestions)
 * below the body. The body is markdown produced by our zod-validated prompt;
 * we set dangerouslySetInnerHTML because the source is trusted.
 */
export function DocsPane({ step, chapter }: Props): JSX.Element {
  const html = useMemo(() => marked.parse(step.body, { async: false }), [step.body])
  return (
    <article className="markdown h-full overflow-y-auto p-5">
      <h2 className="text-text-primary mb-3 text-xl font-semibold">{step.title}</h2>
      <div
        className="text-text-secondary text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {chapter.critique && <CritiqueCallout critique={chapter.critique} />}
    </article>
  )
}
