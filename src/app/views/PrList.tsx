import { Settings } from 'lucide-react'
import { useState, type JSX } from 'react'
import { match } from 'ts-pattern'
import { cn } from '@/app/lib/utils'
import { usePrLists, type ListState, type PrLists } from '@/app/hooks/usePrLists'
import { PrCard } from '@/app/components/PrCard'
import { api, type PullRequestSummary } from '@/lib/api'

type Tab = 'mine' | 'review' | 'reviewed' | 'recents'

interface Props {
  onOpen: (pr: PullRequestSummary) => void
  onOpenSettings: () => void
}

export function PrList({ onOpen, onOpenSettings }: Props): JSX.Element {
  const lists = usePrLists()
  const [tab, setTab] = useState<Tab>('mine')
  const active = pickTab(lists, tab)
  const isLoading =
    lists.mine.kind === 'loading' ||
    lists.review.kind === 'loading' ||
    lists.reviewed.kind === 'loading' ||
    lists.recents.kind === 'loading'

  // Local-cache touch — fire-and-forget upsert so the PR is in Recents next
  // time the user comes back to this view. We don't refresh the lists here;
  // re-mounting / Cmd-R will pick up the new ordering.
  const openAndTouch = (pr: PullRequestSummary): void => {
    api.prs.touchRecent(pr).catch(() => { /* non-fatal — opening the PR still works */ })
    onOpen(pr)
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Pull requests</h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={lists.refresh}
            disabled={isLoading}
            className="text-text-secondary hover:text-text-primary text-xs transition-colors disabled:opacity-40"
          >
            {isLoading ? 'Refreshing…' : '⟳ Refresh'}
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Open settings"
            title="Settings"
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <Settings size={16} aria-hidden />
          </button>
        </div>
      </header>
      <Tabs tab={tab} setTab={setTab} lists={lists} />
      <Body state={active} onOpen={openAndTouch} emptyMessage={emptyMessage(tab)} tab={tab} />
    </div>
  )
}

function pickTab(lists: PrLists, tab: Tab): ListState {
  return match(tab)
    .with('mine', () => lists.mine)
    .with('review', () => lists.review)
    .with('reviewed', () => lists.reviewed)
    .with('recents', () => lists.recents)
    .exhaustive()
}

function Tabs({ tab, setTab, lists }: { tab: Tab; setTab: (t: Tab) => void; lists: PrLists }): JSX.Element {
  return (
    <div className="border-border mb-4 flex gap-1 border-b">
      <TabBtn active={tab === 'mine'} onClick={() => setTab('mine')} label="Mine" count={count(lists.mine)} />
      <TabBtn active={tab === 'review'} onClick={() => setTab('review')} label="Review requested" count={count(lists.review)} />
      <TabBtn active={tab === 'reviewed'} onClick={() => setTab('reviewed')} label="Reviewed" count={count(lists.reviewed)} />
      <TabBtn active={tab === 'recents'} onClick={() => setTab('recents')} label="Recents" count={count(lists.recents)} />
    </div>
  )
}

function TabBtn({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: string }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-2 text-sm transition-colors -mb-px border-b-2',
        active
          ? 'text-text-primary border-text-brand'
          : 'text-text-secondary hover:text-text-primary border-transparent',
      )}
    >
      {label} <span className="text-text-muted ml-1 text-xs">{count}</span>
    </button>
  )
}

function Body({ state, onOpen, emptyMessage, tab }: { state: ListState; onOpen: (pr: PullRequestSummary) => void; emptyMessage: string; tab: Tab }): JSX.Element {
  return match(state)
    .with({ kind: 'loading' }, () => <p className="text-text-secondary">Loading…</p>)
    .with({ kind: 'error' }, ({ message }) => <p className="text-text-danger">Failed to load PRs: {message}</p>)
    .with({ kind: 'ready' }, ({ prs }) => prs.length === 0
      ? <p className="text-text-muted text-sm">{emptyMessage}</p>
      : <PrItems prs={prs} onOpen={onOpen} tab={tab} />,
    )
    .exhaustive()
}

function PrItems({ prs, onOpen, tab }: { prs: PullRequestSummary[]; onOpen: (pr: PullRequestSummary) => void; tab: Tab }): JSX.Element {
  return (
    <ul className="space-y-2">
      {prs.map((pr) => (
        <li key={pr.id}>
          <PrCard pr={pr} context={tab} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  )
}

function count(state: ListState): string {
  return state.kind === 'ready' ? String(state.prs.length) : '–'
}

function emptyMessage(tab: Tab): string {
  return match(tab)
    .with('mine', () => 'No open PRs of yours.')
    .with('review', () => 'No PRs are awaiting your review.')
    .with('reviewed', () => "You haven't reviewed any PRs yet.")
    .with('recents', () => 'No PRs opened recently. Open one from any tab and it lands here.')
    .exhaustive()
}
