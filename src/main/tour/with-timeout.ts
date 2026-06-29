/**
 * Tour / review fail-safe — derive a single AbortSignal that aborts when
 * EITHER the upstream signal aborts OR the timer fires. Without this, a
 * runaway Claude CLI run (large prompt + tool loop) could sit at multi-MB
 * RSS for 15+ minutes with no upper bound.
 *
 * `timedOut.fired` lets the caller distinguish a timer-driven abort
 * (surface "timed out") from a user-driven cancellation (surface the
 * original error).
 *
 * Cleanup MUST be called in `finally` to clear the timer and detach the
 * upstream listener.
 */
export interface TimeoutHandle {
  signal: AbortSignal
  timedOut: { fired: boolean }
  cleanup: () => void
}

export function withTimeout(upstream: AbortSignal, timeoutMs: number): TimeoutHandle {
  const ac = new AbortController()
  const timedOut = { fired: false }
  const onUpstreamAbort = (): void => ac.abort()
  upstream.addEventListener('abort', onUpstreamAbort, { once: true })
  // Non-finite (Infinity / NaN) disables the timer — the upstream Cancel
  // button is the only abort path. Bounded only when an env override or
  // explicit caller value is in play.
  const timer = Number.isFinite(timeoutMs)
    ? setTimeout(() => {
        timedOut.fired = true
        ac.abort()
      }, timeoutMs)
    : null
  return {
    signal: ac.signal,
    timedOut,
    cleanup: () => {
      if (timer != null) clearTimeout(timer)
      upstream.removeEventListener('abort', onUpstreamAbort)
    },
  }
}

/**
 * Read a numeric millisecond override from `process.env[envKey]`, falling
 * back to `defaultMs` when missing / invalid. Used by both tour-gen and
 * review-gen to let power users extend timeouts without a rebuild.
 */
export function resolveTimeoutMs(envKey: string, defaultMs: number): number {
  const raw = Number(process.env[envKey])
  if (Number.isFinite(raw) && raw > 0) return raw
  return defaultMs
}

/**
 * Compute a per-attempt timeout for the tour / review CLI calls.
 *
 * By default this is **unbounded** — sprawling monorepo PRs (100+ files)
 * legitimately need 30+ minutes of model time, and a blanket cap rejects
 * them artificially. The user's explicit Cancel button is the primary
 * stop signal; this helper is here only for environments that want a
 * defensive ceiling.
 *
 * Power users can opt back into a cap via env (`TOUR_ATTEMPT_TIMEOUT_MS`
 * or `REVIEW_ATTEMPT_TIMEOUT_MS`, in milliseconds). When the env override
 * is absent, we return `Infinity` — `withTimeout` short-circuits the
 * timer when given a non-finite value.
 */
export function computeAdaptiveTimeoutMs(opts: { envKey: string; fileCount: number }): number {
  const raw = Number(process.env[opts.envKey])
  if (Number.isFinite(raw) && raw > 0) return raw
  return Number.POSITIVE_INFINITY
}
