import { match } from 'ts-pattern'
import { parseChatEnvelope } from '@/main/chat/chat-output'
import type { ChatPromptBuilder } from '@/main/chat/chat-prompt.builder'
import type { ChatProcessManager } from '@/main/chat/chat-process.manager'
import type { PrChatMessageRecord, PrChatRecord, PrChatStore } from '@/main/chat/chat.store'
import type { GitCloneManager } from '@/main/git/clone.manager'
import { Service } from '@/main/service'
import type { SettingsStore } from '@/main/settings/settings.store'
import type { CliEvent } from '@/main/tour/cli-event'
import type { CliRunnerService } from '@/main/tour/cli-runner.service'
import type { ModelCatalog } from '@/main/tour/model-catalog'
import type { PrContextCollector } from '@/main/tour/pr-context.collector'
import type { TourStore } from '@/main/tour/tour.store'

export interface SendChatInput {
  chatId: number
  message: string
  signal?: AbortSignal
  onEvent?: (e: CliEvent) => void
}

export interface SendChatResult {
  userMessage: PrChatMessageRecord
  assistantMessage: PrChatMessageRecord
}

const CHAT_TOOLS = ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch']
const HISTORY_BUDGET_KEY = 'chat.history.budget'
const TITLE_LEN = 60

/**
 * Orchestrates a single chat turn end to end:
 *  1. Persist the reviewer's message + an assistant placeholder.
 *  2. Resolve the PR context, the cached tour, and a worktree at the PR head.
 *  3. Bound the prior message history per the user's settings budget.
 *  4. Run the CLI with the assembled prompt; stream events upstream.
 *  5. Parse the JSON envelope, update the assistant row, bump chat.updated_at.
 *
 * Title is auto-derived from the first user message; subsequent renames are
 * a no-op here (handled by the rename API).
 */
export class ChatService extends Service {
  constructor(
    private readonly chats: PrChatStore,
    private readonly settings: SettingsStore,
    private readonly prContext: PrContextCollector,
    private readonly tours: TourStore,
    private readonly clones: GitCloneManager,
    private readonly cli: CliRunnerService,
    private readonly models: ModelCatalog,
    private readonly promptBuilder: ChatPromptBuilder,
    private readonly processes: ChatProcessManager,
  ) {
    super()
  }

  /** Returns the OS pid of the long-lived chat subprocess, or null if none is
   * currently attached (chat hasn't been used yet, child died and is awaiting
   * lazy respawn, or the provider doesn't use the persistent path). */
  getPid(chatId: number): number | null {
    return this.processes.getPid(chatId)
  }

  // -------- CRUD pass-throughs ---------

  listChats(repo: string, prNumber: number): PrChatRecord[] {
    return this.chats.listChats(repo, prNumber)
  }

  findChat(id: number): PrChatRecord | undefined {
    return this.chats.findChat(id)
  }

  createChat(repo: string, prNumber: number, title = 'New chat'): PrChatRecord {
    return this.chats.createChat(repo, prNumber, title)
  }

  renameChat(id: number, title: string): PrChatRecord | undefined {
    return this.chats.renameChat(id, title)
  }

  deleteChat(id: number): boolean {
    return this.chats.deleteChat(id)
  }

  listMessages(chatId: number): PrChatMessageRecord[] {
    return this.chats.listMessages(chatId)
  }

  deleteMessage(id: number): boolean {
    return this.chats.deleteMessage(id)
  }

  // -------- The send turn ---------

  async send(input: SendChatInput): Promise<SendChatResult> {
    const chat = this.chats.findChat(input.chatId)
    if (!chat) throw new Error(`Chat ${input.chatId} not found`)

    // Persist the reviewer turn immediately so the UI can show it even on failure.
    const userMessage = this.chats.appendMessage({
      chatId: chat.id,
      role: 'user',
      body: input.message,
      status: 'complete',
    })
    this.maybeAutoTitle(chat, input.message)

    const { provider, model } = this.models.resolve({})
    const placeholder = this.chats.appendMessage({
      chatId: chat.id,
      role: 'assistant',
      body: '',
      status: 'streaming',
      model,
    })

    const partial = new PartialTextBuffer()
    const onEvent = (event: CliEvent): void => {
      partial.record(event)
      input.onEvent?.(event)
    }

    try {
      const tour = this.tours.get(chat.repo, chat.prNumber)
      if (!tour) throw new Error('Generate a tour first — chat needs the PR worktree')

      const ctx = await this.prContext.collect(chat.prNumber, chat.repo)
      const worktree = await this.clones.ensureWorktree(chat.repo, tour.headRefOid)
      const history = this.boundedHistory(chat.id, userMessage.id)

      // Build the right payload for the path we're about to take:
      //   claude + first turn → primer (system + ctx + tour + new msg, no history;
      //     claude has no server-side context yet, so we seed it now)
      //   claude + resume     → just the new message (claude has the full
      //     conversation server-side via --resume <session_uuid>)
      //   codex (one-shot)    → legacy full prompt with replayed history
      const prompt = match({ provider, sessionStarted: chat.sessionStarted })
        .with({ provider: 'claude', sessionStarted: false }, () =>
          this.promptBuilder.buildPrimer({ ctx, tour, newMessage: input.message }),
        )
        .with({ provider: 'claude', sessionStarted: true }, () =>
          this.promptBuilder.buildResume(input.message),
        )
        .otherwise(() =>
          this.promptBuilder.build({ ctx, tour, history, newMessage: input.message }),
        )

      this.logger.info('Chat send', {
        chatId: chat.id,
        repo: chat.repo,
        prNumber: chat.prNumber,
        historyCount: history.length,
        promptBytes: prompt.length,
        provider,
        path:
          provider === 'claude'
            ? chat.sessionStarted
              ? 'persistent-resume'
              : 'persistent-create'
            : 'oneshot',
      })

      // Claude: route through the persistent ChatProcessManager so the
      // process stays alive across turns (eliminates the per-turn cold start
      // and lets claude's own auto-cache amortise the system + tour prefix).
      // Codex: stays on the legacy one-shot cli.run path for now — its CLI
      // doesn't yet support a stable stream-json input mode.
      const run =
        provider === 'claude'
          ? await this.processes.sendTurn({
              chatId: chat.id,
              sessionUuid: this.chats.ensureSessionUuid(chat.id),
              sessionStarted: chat.sessionStarted,
              prompt,
              model,
              cwd: worktree,
              signal: input.signal ?? new AbortController().signal,
              allowedTools: CHAT_TOOLS,
              onEvent,
            })
          : await this.cli.run({
              prompt,
              provider,
              model,
              cwd: worktree,
              signal: input.signal ?? new AbortController().signal,
              allowedTools: CHAT_TOOLS,
              onEvent,
            })

      const envelope = parseChatEnvelope(run.raw)
      const assistantMessage = this.chats.updateMessage(placeholder.id, {
        body: envelope.markdown,
        references: envelope.references.length > 0 ? envelope.references : null,
        diagrams: envelope.diagrams.length > 0 ? envelope.diagrams : null,
        status: 'complete',
      })
      // Flip the create→resume flag so the next spawn (whether after process
      // death, app restart, or simply a fresh send after idle-eviction) uses
      // `--resume <uuid>` to pick up the server-side conversation.
      if (provider === 'claude' && !chat.sessionStarted) this.chats.markSessionStarted(chat.id)
      this.chats.touchChat(chat.id)
      if (!assistantMessage) throw new Error('Assistant message vanished mid-send')
      return { userMessage, assistantMessage }
    } catch (err) {
      const status = isAbort(err) ? 'interrupted' : 'error'
      const fallbackBody = partial.text().trim() || (err as Error).message
      const finalised = this.chats.updateMessage(placeholder.id, {
        body: fallbackBody,
        status,
      })
      this.chats.touchChat(chat.id)
      this.logger.warn('Chat send failed', { chatId: chat.id, status, err: (err as Error).message })
      if (finalised && status === 'interrupted') {
        // Aborts are user-initiated; resolve with the partial result rather than throwing.
        return { userMessage, assistantMessage: finalised }
      }
      throw err
    }
  }

  // -------- helpers ---------

  /**
   * Returns the prior history slice the model should see. With the settings
   * budget set to `null` we send everything that came before; with an
   * integer N we cap to the last 2N rows (= N user+assistant pairs).
   *
   * `excludeMessageId` keeps the just-inserted user message out of "prior
   * history" — it gets appended separately as the question.
   */
  private boundedHistory(chatId: number, excludeMessageId: number): PrChatMessageRecord[] {
    const all = this.chats.listMessages(chatId).filter((m) => m.id !== excludeMessageId)
    const budget = this.settings.get<number | null>(HISTORY_BUDGET_KEY, null)
    if (budget == null || budget <= 0) return all
    const cap = budget * 2
    return all.length > cap ? all.slice(-cap) : all
  }

  /**
   * If this is the chat's first user message, snap the title to a truncated
   * version of it. After the second message the title is whatever the user
   * (or auto-derivation) set, untouched.
   */
  private maybeAutoTitle(chat: PrChatRecord, message: string): void {
    const userCount = this.chats.countUserMessages(chat.id)
    if (userCount !== 1) return
    const title = message.replace(/\s+/g, ' ').trim().slice(0, TITLE_LEN) || 'Untitled chat'
    this.chats.renameChat(chat.id, title)
  }
}

/**
 * Accumulates assistant text fragments emitted as `partial_text` events so we
 * can persist *something* if the run aborts mid-stream. Thinking blocks come
 * through the same channel and are stored too — better partial context than
 * an empty bubble.
 */
class PartialTextBuffer {
  private buf = ''
  record(event: CliEvent): void {
    if (event.type === 'partial_text') this.buf += event.text
  }
  text(): string {
    return this.buf
  }
}

function isAbort(err: unknown): boolean {
  const msg = (err as Error | undefined)?.message ?? ''
  return /aborted|sigterm|cancel/i.test(msg)
}
