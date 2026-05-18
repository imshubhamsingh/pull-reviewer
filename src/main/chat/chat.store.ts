import { randomUUID } from 'node:crypto'
import type { Db } from '@/main/db/db'
import { Service } from '@/main/service'
import type { Diagram } from '@/main/tour/tour-schema'

export interface CodeRef {
  file: string
  lineStart: number
  lineEnd?: number
}

export type ChatMessageRole = 'user' | 'assistant'
export type ChatMessageStatus = 'streaming' | 'complete' | 'interrupted' | 'error'

export interface PrChatRecord {
  id: number
  repo: string
  prNumber: number
  title: string
  /** Stable UUID for the long-lived claude `--session-id` / `--resume` session.
   * Generated on chat creation; lives for the chat's lifetime. */
  sessionUuid: string
  /** False until the first successful turn lands. Drives the spawn-flag
   * choice in `ChatProcessManager`: `--session-id` (create) vs `--resume`. */
  sessionStarted: boolean
  createdAt: string
  updatedAt: string
}

export interface PrChatMessageRecord {
  id: number
  chatId: number
  role: ChatMessageRole
  body: string
  references: CodeRef[] | null
  diagrams: Diagram[] | null
  status: ChatMessageStatus
  model: string | null
  createdAt: string
}

export interface AppendMessageInput {
  chatId: number
  role: ChatMessageRole
  body: string
  references?: CodeRef[] | null
  diagrams?: Diagram[] | null
  status?: ChatMessageStatus
  model?: string | null
}

export interface UpdateMessageInput {
  body?: string
  references?: CodeRef[] | null
  diagrams?: Diagram[] | null
  status?: ChatMessageStatus
  model?: string | null
}

interface ChatRow {
  id: number
  repo: string
  pr_number: number
  title: string
  session_uuid: string | null
  session_started: number
  created_at: string
  updated_at: string
}

interface MessageRow {
  id: number
  chat_id: number
  role: ChatMessageRole
  body: string
  references_json: string | null
  diagrams_json: string | null
  status: ChatMessageStatus
  model: string | null
  created_at: string
}

const CHAT_COLUMNS =
  'id, repo, pr_number, title, session_uuid, session_started, created_at, updated_at'
const MESSAGE_COLUMNS =
  'id, chat_id, role, body, references_json, diagrams_json, status, model, created_at'

export class PrChatStore extends Service {
  constructor(private readonly db: Db) {
    super()
  }

  listChats(repo: string, prNumber: number): PrChatRecord[] {
    const rows = this.db.select<ChatRow>(
      /* sql */ `
        SELECT ${CHAT_COLUMNS}
          FROM pr_chats
         WHERE repo = ?
           AND pr_number = ?
         ORDER BY updated_at DESC, id DESC
      `,
      [repo, prNumber],
    )
    return rows.map(toChatRecord)
  }

  findChat(id: number): PrChatRecord | undefined {
    const row = this.db.selectOne<ChatRow>(
      /* sql */ `SELECT ${CHAT_COLUMNS} FROM pr_chats WHERE id = ?`,
      [id],
    )
    return row ? toChatRecord(row) : undefined
  }

  createChat(repo: string, prNumber: number, title: string): PrChatRecord {
    const now = new Date().toISOString()
    const sessionUuid = randomUUID()
    const result = this.db.insert(
      /* sql */ `
        INSERT INTO pr_chats (repo, pr_number, title, session_uuid, session_started, created_at, updated_at)
        VALUES (@repo, @prNumber, @title, @sessionUuid, 0, @now, @now)
      `,
      { repo, prNumber, title, sessionUuid, now },
    )
    const id = Number(result.lastInsertRowid)
    return {
      id,
      repo,
      prNumber,
      title,
      sessionUuid,
      sessionStarted: false,
      createdAt: now,
      updatedAt: now,
    }
  }

  /** Set after the very first turn lands. Subsequent spawns use `--resume`. */
  markSessionStarted(id: number): void {
    this.db.update(/* sql */ `UPDATE pr_chats SET session_started = 1 WHERE id = ?`, [id])
  }

  /** Back-fill the session uuid for chats created before the
   * `20260522-pr-chat-session` migration. Called by ChatService on first
   * spawn when it discovers a null uuid. */
  ensureSessionUuid(id: number): string {
    const row = this.db.selectOne<{ session_uuid: string | null }>(
      /* sql */ `SELECT session_uuid FROM pr_chats WHERE id = ?`,
      [id],
    )
    if (row?.session_uuid) return row.session_uuid
    const uuid = randomUUID()
    this.db.update(/* sql */ `UPDATE pr_chats SET session_uuid = ? WHERE id = ?`, [uuid, id])
    return uuid
  }

  renameChat(id: number, title: string): PrChatRecord | undefined {
    const now = new Date().toISOString()
    this.db.update(/* sql */ `UPDATE pr_chats SET title = ?, updated_at = ? WHERE id = ?`, [
      title,
      now,
      id,
    ])
    return this.findChat(id)
  }

  touchChat(id: number): void {
    const now = new Date().toISOString()
    this.db.update(/* sql */ `UPDATE pr_chats SET updated_at = ? WHERE id = ?`, [now, id])
  }

  deleteChat(id: number): boolean {
    const { changes } = this.db.delete(/* sql */ `DELETE FROM pr_chats WHERE id = ?`, [id])
    return changes > 0
  }

  listMessages(chatId: number): PrChatMessageRecord[] {
    const rows = this.db.select<MessageRow>(
      /* sql */ `
        SELECT ${MESSAGE_COLUMNS}
          FROM pr_chat_messages
         WHERE chat_id = ?
         ORDER BY id ASC
      `,
      [chatId],
    )
    return rows.map(toMessageRecord)
  }

  appendMessage(input: AppendMessageInput): PrChatMessageRecord {
    const now = new Date().toISOString()
    const refs = input.references ?? null
    const diagrams = input.diagrams ?? null
    const result = this.db.insert(
      /* sql */ `
        INSERT INTO pr_chat_messages
          (chat_id, role, body, references_json, diagrams_json, status, model, created_at)
        VALUES
          (@chatId, @role, @body, @referencesJson, @diagramsJson, @status, @model, @now)
      `,
      {
        chatId: input.chatId,
        role: input.role,
        body: input.body,
        referencesJson: refs ? JSON.stringify(refs) : null,
        diagramsJson: diagrams ? JSON.stringify(diagrams) : null,
        status: input.status ?? 'complete',
        model: input.model ?? null,
        now,
      },
    )
    return {
      id: Number(result.lastInsertRowid),
      chatId: input.chatId,
      role: input.role,
      body: input.body,
      references: refs,
      diagrams,
      status: input.status ?? 'complete',
      model: input.model ?? null,
      createdAt: now,
    }
  }

  updateMessage(id: number, fields: UpdateMessageInput): PrChatMessageRecord | undefined {
    const sets: string[] = []
    const params: Record<string, unknown> = { id }
    if (fields.body !== undefined) {
      sets.push('body = @body')
      params.body = fields.body
    }
    if (fields.references !== undefined) {
      sets.push('references_json = @referencesJson')
      params.referencesJson = fields.references ? JSON.stringify(fields.references) : null
    }
    if (fields.diagrams !== undefined) {
      sets.push('diagrams_json = @diagramsJson')
      params.diagramsJson = fields.diagrams ? JSON.stringify(fields.diagrams) : null
    }
    if (fields.status !== undefined) {
      sets.push('status = @status')
      params.status = fields.status
    }
    if (fields.model !== undefined) {
      sets.push('model = @model')
      params.model = fields.model
    }
    if (sets.length === 0) return this.findMessage(id)
    this.db.update(
      /* sql */ `UPDATE pr_chat_messages SET ${sets.join(', ')} WHERE id = @id`,
      params,
    )
    return this.findMessage(id)
  }

  findMessage(id: number): PrChatMessageRecord | undefined {
    const row = this.db.selectOne<MessageRow>(
      /* sql */ `SELECT ${MESSAGE_COLUMNS} FROM pr_chat_messages WHERE id = ?`,
      [id],
    )
    return row ? toMessageRecord(row) : undefined
  }

  deleteMessage(id: number): boolean {
    const { changes } = this.db.delete(/* sql */ `DELETE FROM pr_chat_messages WHERE id = ?`, [id])
    return changes > 0
  }

  countUserMessages(chatId: number): number {
    const row = this.db.selectOne<{ n: number }>(
      /* sql */ `SELECT COUNT(*) AS n FROM pr_chat_messages WHERE chat_id = ? AND role = 'user'`,
      [chatId],
    )
    return row?.n ?? 0
  }
}

function toChatRecord(row: ChatRow): PrChatRecord {
  return {
    id: row.id,
    repo: row.repo,
    prNumber: row.pr_number,
    title: row.title,
    sessionUuid: row.session_uuid ?? '',
    sessionStarted: row.session_started === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toMessageRecord(row: MessageRow): PrChatMessageRecord {
  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role,
    body: row.body,
    references: parseRefs(row.references_json),
    diagrams: parseDiagrams(row.diagrams_json),
    status: row.status,
    model: row.model,
    createdAt: row.created_at,
  }
}

function parseDiagrams(json: string | null): Diagram[] | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return null
    // Renderer-side defensive: trust the shape since we wrote it ourselves,
    // but drop entries missing the `kind` discriminator.
    return parsed.filter(
      (d): d is Diagram =>
        typeof d === 'object' && d !== null && typeof (d as { kind?: unknown }).kind === 'string',
    )
  } catch {
    return null
  }
}

function parseRefs(json: string | null): CodeRef[] | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed.filter(isCodeRef)
  } catch {
    return null
  }
}

function isCodeRef(value: unknown): value is CodeRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as CodeRef).file === 'string' &&
    typeof (value as CodeRef).lineStart === 'number'
  )
}
