import { useEffect, useMemo, useState } from 'react'
import { match } from 'ts-pattern'
import type { TourChapter, TourStep } from '@/lib/api'

export interface FlatStep {
  chapterIdx: number
  stepIdxInChapter: number
  chapter: TourChapter
  step: TourStep
}

export interface ChapterNav {
  flat: FlatStep[]
  globalIdx: number
  current: FlatStep | undefined
  total: number
  goTo: (i: number) => void
  next: () => void
  prev: () => void
}

interface NavOptions {
  onRegenerate: () => void
  onEscape: () => void
}

export function useChapterNav(chapters: TourChapter[], opts: NavOptions): ChapterNav {
  const flat = useMemo(() => flatten(chapters), [chapters])
  const [globalIdx, setGlobalIdx] = useState(0)

  // Clamp when the tour changes underneath us.
  useEffect(() => {
    setGlobalIdx((i) => Math.min(Math.max(0, i), Math.max(0, flat.length - 1)))
  }, [flat.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const handled = match(e.key)
        .with('ArrowLeft', () => {
          setGlobalIdx((i) => Math.max(0, i - 1))
          return true
        })
        .with('ArrowRight', () => {
          setGlobalIdx((i) => Math.min(flat.length - 1, i + 1))
          return true
        })
        .with('Home', () => {
          setGlobalIdx(0)
          return true
        })
        .with('End', () => {
          setGlobalIdx(Math.max(0, flat.length - 1))
          return true
        })
        .with('ArrowUp', () => {
          setGlobalIdx((i) => jumpChapter(flat, i, -1))
          return true
        })
        .with('ArrowDown', () => {
          setGlobalIdx((i) => jumpChapter(flat, i, +1))
          return true
        })
        .with('r', 'R', () => {
          opts.onRegenerate()
          return true
        })
        .with('Escape', () => {
          opts.onEscape()
          return true
        })
        .otherwise(() => false)
      if (handled) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flat, opts])

  return {
    flat,
    globalIdx,
    current: flat[globalIdx],
    total: flat.length,
    goTo: (i) => setGlobalIdx(Math.min(Math.max(0, i), Math.max(0, flat.length - 1))),
    next: () => setGlobalIdx((i) => Math.min(flat.length - 1, i + 1)),
    prev: () => setGlobalIdx((i) => Math.max(0, i - 1)),
  }
}

function flatten(chapters: TourChapter[]): FlatStep[] {
  const out: FlatStep[] = []
  chapters.forEach((chapter, chapterIdx) => {
    chapter.steps.forEach((step, stepIdxInChapter) => {
      out.push({ chapterIdx, stepIdxInChapter, chapter, step })
    })
  })
  return out
}

function jumpChapter(flat: FlatStep[], current: number, delta: number): number {
  const here = flat[current]
  if (!here) return current
  const targetChapter = here.chapterIdx + delta
  const firstStepOfTarget = flat.findIndex((f) => f.chapterIdx === targetChapter)
  return firstStepOfTarget >= 0 ? firstStepOfTarget : current
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}
