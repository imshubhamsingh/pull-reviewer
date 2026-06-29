import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { cn } from '@/app/lib/utils'

export interface ContextMenuItem {
  label: string
  onClick: () => void
  disabled?: boolean
  /** Greyed-out hint shown after the label, e.g. "TS only". */
  hint?: string
}

interface Props {
  items: ContextMenuItem[]
  anchorX: number
  anchorY: number
  onClose: () => void
}

/**
 * Floating menu rendered via a portal so `overflow-hidden` ancestors never
 * clip it. Position clamps to the viewport. ESC + outside click close.
 */
export function ContextMenu({ items, anchorX, anchorY, onClose }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: anchorX, top: anchorY })

  // Outside click + ESC.
  useEffect(() => {
    const onPointer = (e: PointerEvent): void => {
      if (!ref.current) return
      if (e.target instanceof Node && ref.current.contains(e.target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    // Defer one tick so the same pointerdown that opened the menu doesn't close it.
    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointer)
      document.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Clamp to viewport after we know our size.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 8
    const maxLeft = window.innerWidth - rect.width - margin
    const maxTop = window.innerHeight - rect.height - margin
    setPos({
      left: Math.max(margin, Math.min(anchorX, maxLeft)),
      top: Math.max(margin, Math.min(anchorY, maxTop)),
    })
  }, [anchorX, anchorY])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 1000 }}
      className="border-border bg-surface min-w-[200px] rounded-md border py-1 text-xs shadow-lg"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, idx) => (
        <MenuItem
          key={idx}
          item={item}
          onClick={() => {
            if (item.disabled) return
            item.onClick()
            onClose()
          }}
        />
      ))}
    </div>,
    document.body,
  )
}

function MenuItem({ item, onClick }: { item: ContextMenuItem; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={item.disabled}
      className={cn(
        'flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left transition-colors',
        item.disabled
          ? 'text-text-muted cursor-not-allowed'
          : 'text-text-primary hover:bg-surface-hover',
      )}
    >
      <span>{item.label}</span>
      {item.hint && <span className="text-text-muted text-[10px]">{item.hint}</span>}
    </button>
  )
}
