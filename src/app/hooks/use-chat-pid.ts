import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

/**
 * Polls the OS pid of the long-lived claude subprocess handling the active
 * chat. Returns null until the user sends a first message (the subprocess
 * spawns lazily) and re-syncs every 5s so respawn-after-death surfaces the
 * new pid without a manual refresh.
 *
 * Polling is paused when there's no active chat or the active id is < 0
 * (optimistic placeholders during new-chat creation use negative ids).
 */
export function useChatPid(repo: string, prNumber: number, chatId: number | null): number | null {
  const [pid, setPid] = useState<number | null>(null)

  useEffect(() => {
    if (chatId == null || chatId <= 0) {
      setPid(null)
      return
    }
    let cancelled = false

    const fetchOnce = async (): Promise<void> => {
      try {
        const { pid: next } = await api.chats.getPid(repo, prNumber, chatId)
        if (!cancelled) setPid(next)
      } catch {
        // Transient — keep the last value rather than flashing null.
      }
    }

    void fetchOnce()
    const interval = setInterval(() => {
      void fetchOnce()
    }, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [repo, prNumber, chatId])

  return pid
}
