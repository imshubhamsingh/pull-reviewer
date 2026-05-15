import { useState, type JSX } from 'react'
import { match } from 'ts-pattern'
import { PrList } from '@/app/views/PrList'
import { SettingsView } from '@/app/views/SettingsView'
import { TourView } from '@/app/views/TourView'

type View =
  | { kind: 'list' }
  | { kind: 'tour'; repo: string; prNumber: number }
  | { kind: 'settings' }

export function App(): JSX.Element {
  const [view, setView] = useState<View>({ kind: 'list' })
  const back = () => setView({ kind: 'list' })
  const openSettings = () => setView({ kind: 'settings' })

  return match(view)
    .with({ kind: 'list' }, () => (
      <PrList
        onOpen={(pr) => setView({ kind: 'tour', repo: pr.repo, prNumber: pr.number })}
        onOpenSettings={openSettings}
      />
    ))
    .with({ kind: 'tour' }, ({ repo, prNumber }) => (
      <TourView repo={repo} prNumber={prNumber} onBack={back} />
    ))
    .with({ kind: 'settings' }, () => (
      <SettingsView onBack={back} />
    ))
    .exhaustive()
}
