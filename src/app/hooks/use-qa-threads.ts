import { useCallback, useEffect, useState } from 'react'
import { api, type AskAiInput, type AskStreamEvent, type QaThread } from '@/lib/api'

export interface QaThreads {
  threads: QaThread[]
  loading: boolean
  error: string | undefined
  byFile: (file: string) => QaThread[]
  /**
   * Threads anchored to either the given chapter id OR the given file. Use
   * this when rendering a chapter's docs pane: threads created from the
   * chapter's pinned files PLUS threads created on standalone reference files
   * while the user was on this chapter both surface together.
   */
  forChapter: (chapterId: string | undefined, file: string | undefined) => QaThread[]
  ask: (input: AskAiInput) => Promise<QaThread>
  /**
   * Streaming variant — invokes onEvent for each tool_call / partial_text /
   * final event, and resolves with the persisted thread after `done`.
   */
  askStream: (
    input: AskAiInput,
    opts: { onEvent: (e: AskStreamEvent) => void; signal?: AbortSignal },
  ) => Promise<QaThread>
  remove: (id: number) => Promise<void>
  refresh: () => Promise<void>
}

export function useQaThreads(repo: string, prNumber: number): QaThreads {
  const [threads, setThreads] = useState<QaThread[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.qa.list(repo, prNumber)
      setThreads(list)
      setError(undefined)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [repo, prNumber])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    threads,
    loading,
    error,
    byFile: (file) => threads.filter((t) => t.file === file),
    forChapter: (chapterId, file) =>
      threads.filter(
        (t) =>
          (chapterId != null && t.chapterId === chapterId) || (file != null && t.file === file),
      ),
    ask: async (input) => {
      const created = await api.qa.ask(repo, prNumber, input)
      setThreads((prev) => [...prev, created])
      return created
    },
    askStream: async (input, { onEvent, signal }) => {
      let thread: QaThread | undefined
      let errorMsg: string | undefined
      for await (const evt of api.qa.askStream(repo, prNumber, input, { signal })) {
        onEvent(evt)
        if (evt.event === 'done') thread = evt.data
        if (evt.event === 'error') errorMsg = evt.data.message
      }
      if (errorMsg) throw new Error(errorMsg)
      if (!thread) throw new Error('Stream ended without a done event')
      setThreads((prev) => [...prev, thread])
      return thread
    },
    remove: async (id) => {
      await api.qa.remove(id)
      setThreads((prev) => prev.filter((t) => t.id !== id))
    },
    refresh,
  }
}
