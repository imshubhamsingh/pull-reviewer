import { useCallback, useEffect, useState } from 'react'
import { api, type CreateDraftInput, type ReviewDraft, type SubmitReviewInput, type SubmittedReview } from '@/lib/api'

export interface ReviewDrafts {
  drafts: ReviewDraft[]
  loading: boolean
  error: string | undefined
  byLine: (file: string, line: number) => ReviewDraft[]
  add: (input: CreateDraftInput) => Promise<void>
  update: (id: number, body: string) => Promise<void>
  remove: (id: number) => Promise<void>
  submit: (input: SubmitReviewInput) => Promise<SubmittedReview>
  refresh: () => Promise<void>
}

export function useReviewDrafts(repo: string, prNumber: number): ReviewDrafts {
  const [drafts, setDrafts] = useState<ReviewDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.reviews.list(repo, prNumber)
      setDrafts(list)
      setError(undefined)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [repo, prNumber])

  useEffect(() => { void refresh() }, [refresh])

  return {
    drafts,
    loading,
    error,
    byLine: (file, line) => drafts.filter((d) => d.file === file && d.line === line),
    add: async (input) => {
      const created = await api.reviews.create(repo, prNumber, input)
      setDrafts((prev) => [...prev, created])
    },
    update: async (id, body) => {
      const updated = await api.reviews.update(id, body)
      setDrafts((prev) => prev.map((d) => d.id === id ? updated : d))
    },
    remove: async (id) => {
      await api.reviews.remove(id)
      setDrafts((prev) => prev.filter((d) => d.id !== id))
    },
    submit: async (input) => {
      const result = await api.reviews.submit(repo, prNumber, input)
      setDrafts([])
      return result
    },
    refresh,
  }
}
