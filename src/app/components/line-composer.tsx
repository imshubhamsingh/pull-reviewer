import { useCallback, useState, type JSX } from 'react'
import { match } from 'ts-pattern'
import type { AskStreamEvent, QaThread } from '@/lib/api'
import { AskAiPanel, type AskActions, type AskContext } from '@/app/components/ask-ai-panel'
import { MarkdownView } from '@/app/components/markdown-view'
import { cn } from '@/app/lib/utils'

type Tab = 'write' | 'preview' | 'ask'

interface Props {
  initial?: string
  rangeLabel?: string
  /** When provided, an "Ask AI" tab is shown that opens an inline AskAiPanel. */
  askContext?: AskContext
  onAskStream?: (question: string, onEvent: (e: AskStreamEvent) => void) => Promise<QaThread>
  onSave: (body: string) => Promise<void>
  onCancel: () => void
  saveLabel?: string
}

export function LineComposer({
  initial = '',
  rangeLabel,
  askContext,
  onAskStream,
  onSave,
  onCancel,
  saveLabel = 'Add comment',
}: Props): JSX.Element {
  const [body, setBody] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('write')
  const [askActions, setAskActions] = useState<AskActions | undefined>(undefined)
  const canSave = body.trim().length > 0 && !busy
  const canAsk = !!askContext && !!onAskStream
  const onAskActionsChange = useCallback((a: AskActions) => setAskActions(a), [])

  const save = async (): Promise<void> => {
    if (!canSave) return
    setBusy(true)
    try {
      await onSave(body.trim())
    } finally {
      setBusy(false)
    }
  }

  const hasPreview = body.trim().length > 0

  return (
    <div className="border-border bg-surface mx-3 my-1 rounded-md border p-2 whitespace-normal">
      {rangeLabel && (
        <p className="text-text-muted mb-1 text-[10px] tracking-wider uppercase">
          Comment on {rangeLabel}
        </p>
      )}
      <Tabs tab={tab} setTab={setTab} canAsk={canAsk} />
      {match(tab)
        .with('write', () => (
          <textarea
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void save()
              if (e.key === 'Escape') onCancel()
            }}
            placeholder="Leave a review comment… (⌘↵ to save, Esc to cancel)"
            rows={3}
            className="bg-bg border-border text-text-primary w-full resize-y rounded-sm border px-2 py-1 text-xs leading-relaxed outline-none"
          />
        ))
        .with('preview', () =>
          hasPreview ? (
            <MarkdownView
              body={body}
              className="bg-bg border-border text-text-primary min-h-[5.5rem] overflow-auto rounded-sm border px-2 py-1 text-xs leading-relaxed"
            />
          ) : (
            <p className="bg-bg border-border text-text-muted flex min-h-[5.5rem] items-center rounded-sm border px-2 py-1 text-xs italic">
              Nothing to preview yet — switch to Write to add content.
            </p>
          ),
        )
        .with('ask', () =>
          askContext && onAskStream ? (
            <AskAiPanel
              context={askContext}
              onAskStream={onAskStream}
              onActionsChange={onAskActionsChange}
              onUseAsComment={(text) => {
                setBody((prev) => (prev ? `${prev}\n\n${text}` : text))
                setTab('write')
              }}
            />
          ) : null,
        )
        .exhaustive()}
      <PrimaryFooter
        tab={tab}
        onCancel={onCancel}
        onSave={() => void save()}
        canSave={canSave}
        saveLabel={saveLabel}
        saveBusy={busy}
        askActions={askActions}
      />
    </div>
  )
}

interface PrimaryFooterProps {
  tab: Tab
  onCancel: () => void
  onSave: () => void
  canSave: boolean
  saveLabel: string
  saveBusy: boolean
  askActions: AskActions | undefined
}

function PrimaryFooter({
  tab,
  onCancel,
  onSave,
  canSave,
  saveLabel,
  saveBusy,
  askActions,
}: PrimaryFooterProps): JSX.Element {
  const { onClick, label, disabled } = match(tab)
    .with('ask', () => ({
      onClick: () => askActions?.submit(),
      label: askActions?.busy ? 'Asking…' : 'Ask',
      disabled: !askActions?.canSubmit,
    }))
    .otherwise(() => ({
      onClick: onSave,
      label: saveBusy ? 'Saving…' : saveLabel,
      disabled: !canSave,
    }))
  return (
    <div className="mt-2 flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="text-text-secondary hover:text-text-primary text-xs transition-colors"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="bg-interactive-primary hover:bg-interactive-primary-hover text-interactive-primary-fg rounded-sm px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      >
        {label}
      </button>
    </div>
  )
}

function Tabs({
  tab,
  setTab,
  canAsk,
}: {
  tab: Tab
  setTab: (t: Tab) => void
  canAsk: boolean
}): JSX.Element {
  return (
    <div className="border-border mb-2 flex gap-1 border-b">
      <TabBtn active={tab === 'write'} onClick={() => setTab('write')} label="Write" />
      <TabBtn active={tab === 'preview'} onClick={() => setTab('preview')} label="Preview" />
      {canAsk && <TabBtn active={tab === 'ask'} onClick={() => setTab('ask')} label="✨ Ask AI" />}
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px border-b-2 px-2 py-1 text-xs transition-colors',
        active
          ? 'border-text-brand text-text-primary'
          : 'text-text-secondary hover:text-text-primary border-transparent',
      )}
    >
      {label}
    </button>
  )
}
