import { spawn, type ChildProcess } from 'node:child_process'
import { Service } from '@/main/service'
import type { CliEvent } from '@/main/tour/cli-event'
import { CliStreamParser, type CliResultMeta } from '@/main/tour/cli-stream-parser'

/**
 * Long-lived `claude` subprocess per chat session.
 *
 * Eliminates the ~1-3s cold-start that every chat turn paid under the old
 * per-turn-spawn model. Each chat opens one child process the first time the
 * user sends a message; subsequent turns write a JSON line to its stdin and
 * stream the response back. Claude's own auto-cache (with `ephemeral_1h`
 * TTL) handles cost amortisation on the stable system + tour prefix.
 *
 * Lifecycle:
 * - **Lazy spawn** on first `sendTurn` for a given chatId.
 * - **Silent transparent retry**: if the child has exited between turns, the
 *   next `sendTurn` respawns automatically and proceeds — the user just sees
 *   the new PID on the next render.
 * - **Idle GC** every minute kills children idle > IDLE_TTL_MS (5 min).
 * - **App-quit**: `shutdown()` SIGTERMs every child.
 *
 * Concurrency invariant: callers must not call `sendTurn` for the same chatId
 * in parallel. The renderer's `chat.streaming` flag already enforces this at
 * the UI boundary — `Composer` disables Send while a turn is in flight.
 */

export interface SendTurnOptions {
  chatId: number
  /** Stable UUID for this chat's claude session. Stored on the pr_chats row;
   * passed verbatim to `--session-id` on first spawn and `--resume` after. */
  sessionUuid: string
  /** False on the very first spawn for this chat → use `--session-id` (create
   * the session). True for any subsequent spawn (including after process
   * death or app restart) → use `--resume` (server-side context survives). */
  sessionStarted: boolean
  /** User-turn content to write to the persistent child's stdin. For a fresh
   * session this is the primer (system + ctx + tour + first user message);
   * for a resumed session this is just the user's latest message — claude
   * has the prior conversation from `--resume`. */
  prompt: string
  model: string
  cwd: string
  signal: AbortSignal
  allowedTools: string[]
  onEvent?: (event: CliEvent) => void
}

export interface SendTurnResult {
  raw: string
  costUsd?: number
  durationMs?: number
  usage?: {
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens?: number
    cacheReadInputTokens?: number
  }
}

interface ChatSession {
  chatId: number
  child: ChildProcess
  pid: number
  spawnedAt: number
  lastActiveAt: number
  /** Held across turns so we can attach a fresh data listener per send without
   * leaking handlers from prior turns. */
  dispose: () => void
}

const IDLE_TTL_MS = 5 * 60 * 1000
const GC_INTERVAL_MS = 60 * 1000
const SHUTDOWN_GRACE_MS = 5 * 1000

export class ChatProcessManager extends Service {
  private readonly sessions = new Map<number, ChatSession>()
  private gcTimer: ReturnType<typeof setInterval> | undefined

  constructor() {
    super()
    this.gcTimer = setInterval(() => this.evictIdle(), GC_INTERVAL_MS)
  }

  /**
   * Return the live PID for a chat, or null if no process is currently
   * attached. The chat router polls this from the renderer so the chat
   * header can render `· pid N`.
   */
  getPid(chatId: number): number | null {
    return this.sessions.get(chatId)?.pid ?? null
  }

  async sendTurn(opts: SendTurnOptions): Promise<SendTurnResult> {
    const session = this.ensureAlive(opts)
    session.lastActiveAt = Date.now()
    return this.runTurn(session, opts)
  }

  /** Kill every child. Called from the main-process shutdown hook so we don't
   * leak orphan processes on app quit. */
  shutdown(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer)
      this.gcTimer = undefined
    }
    for (const session of this.sessions.values()) {
      this.killSession(session)
    }
    this.sessions.clear()
  }

  private ensureAlive(opts: SendTurnOptions): ChatSession {
    const existing = this.sessions.get(opts.chatId)
    if (existing && !existing.child.killed && existing.child.exitCode == null) {
      return existing
    }
    if (existing) {
      // Stale entry — child exited between turns. Silent respawn.
      this.logger.info('Respawning chat process', { chatId: opts.chatId, prevPid: existing.pid })
      this.sessions.delete(opts.chatId)
    }
    return this.spawn(opts)
  }

  private spawn(opts: SendTurnOptions): ChatSession {
    const args = [
      '-p',
      '--input-format=stream-json',
      '--output-format=stream-json',
      '--verbose',
      '--allowedTools',
      opts.allowedTools.join(','),
      '--model',
      opts.model,
      // `--session-id` creates a new server-side session; `--resume` picks up
      // an existing one. ChatService flips the flag after the first turn
      // lands so respawns recover the conversation transparently.
      ...(opts.sessionStarted
        ? ['--resume', opts.sessionUuid]
        : ['--session-id', opts.sessionUuid]),
    ]
    const child = spawn('claude', args, {
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const pid = child.pid ?? -1
    this.logger.info('Spawned chat process', {
      chatId: opts.chatId,
      pid,
      model: opts.model,
      sessionUuid: opts.sessionUuid,
      mode: opts.sessionStarted ? 'resume' : 'create',
    })

    // We attach a long-lived stderr drain so the OS pipe buffer doesn't fill
    // up and back-pressure stdout. stderr is otherwise noise.
    child.stderr?.on('data', () => {
      /* drain */
    })
    child.on('exit', (code, signal) => {
      this.logger.info('Chat process exited', { chatId: opts.chatId, pid, code, signal })
      // Don't auto-respawn here — wait for the next sendTurn to do it lazily.
      // Clean up the entry so getPid returns null until then.
      const session = this.sessions.get(opts.chatId)
      if (session && session.child === child) this.sessions.delete(opts.chatId)
    })

    const session: ChatSession = {
      chatId: opts.chatId,
      child,
      pid,
      spawnedAt: Date.now(),
      lastActiveAt: Date.now(),
      dispose: () => undefined,
    }
    this.sessions.set(opts.chatId, session)
    return session
  }

  private runTurn(session: ChatSession, opts: SendTurnOptions): Promise<SendTurnResult> {
    const parser = new CliStreamParser()
    const emit = (e: CliEvent): void => opts.onEvent?.(e)

    return new Promise<SendTurnResult>((resolve, reject) => {
      let settled = false
      const onData = (chunk: Buffer): void => parser.feed(chunk.toString(), emit)
      const onErr = (err: Error): void => {
        if (settled) return
        settled = true
        cleanup()
        reject(err)
      }
      const onAbort = (): void => {
        if (settled) return
        settled = true
        cleanup()
        // Killing the child is the cleanest abort path — next sendTurn will
        // respawn. Sending a control char wouldn't be honoured by claude in
        // stream-json mode.
        try {
          session.child.kill('SIGTERM')
        } catch {
          /* already dead */
        }
        reject(new Error('Chat turn aborted'))
      }
      const onExit = (code: number | null): void => {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error(`Chat process exited mid-turn (code ${code ?? 'null'})`))
      }
      const cleanup = (): void => {
        session.child.stdout?.off('data', onData)
        session.child.off('error', onErr)
        session.child.off('exit', onExit)
        opts.signal.removeEventListener('abort', onAbort)
        parser.onResult = undefined
      }

      parser.onResult = (raw, meta) => {
        if (settled) return
        settled = true
        cleanup()
        emit({ type: 'final', raw, ...meta })
        resolve({ raw, ...this.copyMeta(meta) })
      }

      session.child.stdout?.on('data', onData)
      session.child.on('error', onErr)
      session.child.on('exit', onExit)
      opts.signal.addEventListener('abort', onAbort, { once: true })

      const line =
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: opts.prompt },
        }) + '\n'

      try {
        const stdin = session.child.stdin
        if (!stdin || !stdin.writable) throw new Error('Chat process stdin is closed')
        stdin.write(line)
      } catch (err) {
        if (settled) return
        settled = true
        cleanup()
        reject(err as Error)
      }
    })
  }

  private copyMeta(meta: CliResultMeta): Omit<SendTurnResult, 'raw'> {
    return { costUsd: meta.costUsd, durationMs: meta.durationMs, usage: meta.usage }
  }

  private evictIdle(): void {
    const now = Date.now()
    for (const session of [...this.sessions.values()]) {
      if (now - session.lastActiveAt < IDLE_TTL_MS) continue
      this.logger.info('Evicting idle chat process', {
        chatId: session.chatId,
        pid: session.pid,
        idleMs: now - session.lastActiveAt,
      })
      this.killSession(session)
      this.sessions.delete(session.chatId)
    }
  }

  private killSession(session: ChatSession): void {
    try {
      session.child.stdin?.end()
    } catch {
      /* already closed */
    }
    try {
      session.child.kill('SIGTERM')
    } catch {
      /* already dead */
    }
    // Fallback hard-kill if SIGTERM doesn't take.
    setTimeout(() => {
      if (!session.child.killed) {
        try {
          session.child.kill('SIGKILL')
        } catch {
          /* gone */
        }
      }
    }, SHUTDOWN_GRACE_MS)
  }
}
