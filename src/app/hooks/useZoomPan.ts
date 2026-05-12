import { useCallback, useState } from 'react'

export interface ZoomPan {
  scale: number
  zoomIn: () => void
  zoomOut: () => void
  reset: () => void
  fitTo: (scale: number) => void
  onWheel: (e: React.WheelEvent) => void
}

const MIN = 0.25
const MAX = 8
const STEP = 1.25

export function useZoomPan(initial = 1): ZoomPan {
  const [scale, setScale] = useState(initial)
  const clamp = (s: number) => Math.max(MIN, Math.min(MAX, s))
  return {
    scale,
    zoomIn: useCallback(() => setScale((s) => clamp(s * STEP)), []),
    zoomOut: useCallback(() => setScale((s) => clamp(s / STEP)), []),
    reset: useCallback(() => setScale(initial), [initial]),
    fitTo: useCallback((s: number) => setScale(clamp(s)), []),
    onWheel: useCallback((e: React.WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      setScale((s) => clamp(s * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))
    }, []),
  }
}
