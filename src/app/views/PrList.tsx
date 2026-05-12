import { useState, type JSX } from 'react'
import { match } from 'ts-pattern'
import { cn } from '@/app/lib/utils'
import { usePrLists, type ListState } from '@/app/hooks/usePrLists'
import type { PullRequestSummary } from '@/lib/api'

type Tab = 'mine' | 'review'

interface Props {
  onOpen: (pr: PullRequestSummary) => void
}

export function PrList({ onOpen }: Props): JSX.Element {
  const lists = usePrLists()
  const [tab, setTab] = useState<Tab>('mine')
  const active = tab === 'mine' ? lists.mine : lists.review

  const isLoading = lists.mine.kind === 'loading' || lists.review.kind === 'loading'

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Pull requests</h1>
        <button
          type="button"
          onClick={lists.refresh}
          disabled={isLoading}
          className="text-text-secondary hover:text-text-primary text-xs transition-colors disabled:opacity-40"
        >
          {isLoading ? 'Refreshing…' : '⟳ Refresh'}
        </button>
      </header>
      <Tabs tab={tab} setTab={setTab} mineCount={count(lists.mine)} reviewCount={count(lists.review)} />
      <Body state={active} onOpen={onOpen} emptyMessage={emptyMessage(tab)} />
    </div>
  )
}

function Tabs({ tab, setTab, mineCount, reviewCount }: { tab: Tab; setTab: (t: Tab) => void; mineCount: string; reviewCount: string }): JSX.Element {
  return (
    <div className="border-border mb-4 flex gap-1 border-b">
      <TabBtn active={tab === 'mine'} onClick={() => setTab('mine')} label="Mine" count={mineCount} />
      <TabBtn active={tab === 'review'} onClick={() => setTab('review')} label="Review requested" count={reviewCount} />
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

function Body({ state, onOpen, emptyMessage }: { state: ListState; onOpen: (pr: PullRequestSummary) => void; emptyMessage: string }): JSX.Element {
  return match(state)
    .with({ kind: 'loading' }, () => <p className="text-text-secondary">Loading…</p>)
    .with({ kind: 'error' }, ({ message }) => <p className="text-text-danger">Failed to load PRs: {message}</p>)
    .with({ kind: 'ready' }, ({ prs }) => prs.length === 0
      ? <p className="text-text-muted text-sm">{emptyMessage}</p>
      : <PrItems prs={prs} onOpen={onOpen} />,
    )
    .exhaustive()
}

function PrItems({ prs, onOpen }: { prs: PullRequestSummary[]; onOpen: (pr: PullRequestSummary) => void }): JSX.Element {
  return (
    <ul className="space-y-2">
      {prs.map((pr) => (
        <li key={pr.id}>
          <button
            type="button"
            onClick={() => onOpen(pr)}
            className="border-border bg-surface hover:bg-surface-hover w-full rounded-md border px-4 py-3 text-left transition-colors"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-text-secondary text-sm">#{pr.number}</span>
              <span className="text-text-primary font-medium">{pr.title}</span>
              {pr.isDraft && <span className="text-text-muted text-xs">· draft</span>}
            </div>
            <div className="text-text-muted mt-1 flex items-baseline gap-2 text-xs">
              <span>{pr.repo}</span>
              <span aria-hidden>·</span>
              <span>{pr.author}</span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

function count(state: ListState): string {
  return state.kind === 'ready' ? String(state.prs.length) : '–'
}

function emptyMessage(tab: Tab): string {
  return tab === 'mine' ? 'No open PRs of yours.' : 'No PRs are awaiting your review.'
}
