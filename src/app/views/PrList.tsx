import { useState, type JSX } from 'react'
import { match } from 'ts-pattern'
import { cn } from '@/app/lib/utils'
import { usePrLists, type ListState, type PrLists } from '@/app/hooks/usePrLists'
import { PrCard } from '@/app/components/PrCard'
import type { PullRequestSummary } from '@/lib/api'

type Tab = 'mine' | 'review'

interface Props {
  onOpen: (pr: PullRequestSummary) => void
}

export function PrList({ onOpen }: Props): JSX.Element {
  const lists = usePrLists()
  const [tab, setTab] = useState<Tab>('mine')
  const active = pickTab(lists, tab)
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
      <Tabs tab={tab} setTab={setTab} lists={lists} />
      <Body state={active} onOpen={onOpen} emptyMessage={emptyMessage(tab)} tab={tab} />
    </div>
  )
}

function pickTab(lists: PrLists, tab: Tab): ListState {
  return match(tab)
    .with('mine', () => lists.mine)
    .with('review', () => lists.review)
    .exhaustive()
}

function Tabs({ tab, setTab, lists }: { tab: Tab; setTab: (t: Tab) => void; lists: PrLists }): JSX.Element {
  return (
    <div className="border-border mb-4 flex gap-1 border-b">
      <TabBtn active={tab === 'mine'} onClick={() => setTab('mine')} label="Mine" count={count(lists.mine)} />
      <TabBtn active={tab === 'review'} onClick={() => setTab('review')} label="Review requested" count={count(lists.review)} />
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
    .exhaustive()
}
