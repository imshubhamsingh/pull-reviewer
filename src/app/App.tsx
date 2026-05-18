import { useEffect, useState, type JSX } from 'react'
import { match } from 'ts-pattern'
import type { OpenPrTourPayload } from '@/lib/ipc/channels'
import { PrList } from '@/app/views/pr-list'
import { SettingsView } from '@/app/views/settings-view'
import { TourView } from '@/app/views/tour-view'

type View =
  | { kind: 'list' }
  | { kind: 'tour'; repo: string; prNumber: number }
  | { kind: 'settings' }

interface ElectronApi {
  onOpenPrTour?: (handler: (payload: OpenPrTourPayload) => void) => () => void
}

export function App(): JSX.Element {
  const [view, setView] = useState<View>({ kind: 'list' })
  const back = (): void => setView({ kind: 'list' })
  const openSettings = (): void => setView({ kind: 'settings' })

  // Notification click from main → navigate to that PR's TourView. Works
  // from any current view (PR list, another PR's tour, settings).
  useEffect(() => {
    const electron = (window as unknown as { electron?: ElectronApi }).electron
    if (!electron?.onOpenPrTour) return
    return electron.onOpenPrTour((payload) => {
      setView({ kind: 'tour', repo: payload.repo, prNumber: payload.prNumber })
    })
  }, [])

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
    .with({ kind: 'settings' }, () => <SettingsView onBack={back} />)
    .exhaustive()
}
