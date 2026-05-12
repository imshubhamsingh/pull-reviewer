import { useState, type JSX } from 'react'
import { match } from 'ts-pattern'
import { PrList } from '@/app/views/PrList'
import { TourView } from '@/app/views/TourView'

type View =
  | { kind: 'list' }
  | { kind: 'tour'; repo: string; prNumber: number }

export function App(): JSX.Element {
  const [view, setView] = useState<View>({ kind: 'list' })
  const back = () => setView({ kind: 'list' })

  return match(view)
    .with({ kind: 'list' }, () => (
      <PrList onOpen={(pr) => setView({ kind: 'tour', repo: pr.repo, prNumber: pr.number })} />
    ))
    .with({ kind: 'tour' }, ({ repo, prNumber }) => (
      <TourView repo={repo} prNumber={prNumber} onBack={back} />
    ))
    .exhaustive()
}
