import { useEffect, useState, type JSX } from 'react'
import { useSettings } from '@/app/hooks/useSettings'
import { cn } from '@/app/lib/utils'

interface Props {
  onBack: () => void
}

/**
 * Top-level Settings page. One section per setting — currently just the chat
 * history budget. Auto-saves on change (debounced) so there's no Save button.
 */
export function SettingsView({ onBack }: Props): JSX.Element {
  const { settings, loading, error, update } = useSettings()

  return (
    <div className="flex h-full flex-col">
      <Header onBack={onBack} />
      <div className="bg-bg text-text-secondary min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-2xl">
          {loading
            ? <p className="text-text-muted text-sm">Loading…</p>
            : <ChatHistoryBudgetRow
                value={settings.chatHistoryBudget}
                onChange={(next) => update({ chatHistoryBudget: next })}
              />}
          {error && <p className="text-text-danger mt-3 text-xs">{error}</p>}
        </div>
      </div>
    </div>
  )
}

function Header({ onBack }: { onBack: () => void }): JSX.Element {
  return (
    <header className="border-border bg-surface flex items-center justify-between border-b px-4 py-2">
      <button
        type="button"
        onClick={onBack}
        className="text-text-secondary hover:text-text-primary text-sm transition-colors"
      >
        ← back
      </button>
      <h1 className="text-text-primary text-sm font-medium">Settings</h1>
      <span aria-hidden className="w-12" />
    </header>
  )
}

interface BudgetRowProps {
  value: number | null
  onChange: (next: number | null) => void | Promise<void>
}

const DEBOUNCE_MS = 400

function ChatHistoryBudgetRow({ value, onChange }: BudgetRowProps): JSX.Element {
  const mode: 'full' | 'limited' = value == null ? 'full' : 'limited'
  const [draftN, setDraftN] = useState<number>(value ?? 5)

  // Push limited-mode changes after the user stops typing so we don't write on every keystroke.
  useEffect(() => {
    if (mode !== 'limited') return
    const t = setTimeout(() => { if (draftN !== value) void onChange(draftN) }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [draftN, mode, value, onChange])

  return (
    <section className="border-border bg-surface rounded-md border p-4">
      <Label>Chat history budget</Label>
      <Description>
        How many user+assistant pairs the chat service replays to the model on each send.
        Full keeps every prior turn; limited caps the most-recent N pairs to keep prompts small.
      </Description>
      <div className="mt-3 flex flex-col gap-3">
        <RadioOption
          checked={mode === 'full'}
          onSelect={() => { void onChange(null) }}
          label="Full history"
          hint="Replay every prior turn. Best with prompt caching."
        />
        <RadioOption
          checked={mode === 'limited'}
          onSelect={() => { void onChange(Math.max(1, draftN)) }}
          label="Last N pairs"
          hint={mode === 'limited' ? `Currently capped at ${value ?? draftN} pair(s).` : 'Cap recent history.'}
        >
          {mode === 'limited' && (
            <input
              type="number"
              min={1}
              max={50}
              value={draftN}
              onChange={(e) => setDraftN(Math.max(1, Number(e.target.value) || 1))}
              className="border-border bg-bg text-text-primary w-20 rounded-sm border px-2 py-1 text-xs outline-none"
              aria-label="Number of pairs"
            />
          )}
        </RadioOption>
      </div>
    </section>
  )
}

function Label({ children }: { children: string }): JSX.Element {
  return <h2 className="text-text-primary text-sm font-medium">{children}</h2>
}

function Description({ children }: { children: string }): JSX.Element {
  return <p className="text-text-muted mt-1 text-xs">{children}</p>
}

interface RadioOptionProps {
  checked: boolean
  onSelect: () => void
  label: string
  hint: string
  children?: JSX.Element | false
}

function RadioOption({ checked, onSelect, label, hint, children }: RadioOptionProps): JSX.Element {
  return (
    <label
      className={cn(
        'flex items-center gap-3 rounded-sm px-2 py-1 cursor-pointer transition-colors',
        checked ? 'bg-surface-hover' : 'hover:bg-surface-hover/60',
      )}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onSelect}
        className="accent-text-brand"
      />
      <span className="flex-1">
        <span className="text-text-primary block text-xs font-medium">{label}</span>
        <span className="text-text-muted block text-[11px]">{hint}</span>
      </span>
      {children}
    </label>
  )
}
