import type { Db } from '@/main/db/db'
import { Service } from '@/main/service'

export interface QaThreadRecord {
  id: number
  repo: string
  prNumber: number
  file: string
  startLine: number
  endLine: number
  question: string
  answer: string
  model: string | null
  /** Chapter the user was on when this thread was created — null for pre-migration / ad-hoc threads. */
  chapterId: string | null
  createdAt: string
}

export interface QaThreadInput {
  repo: string
  prNumber: number
  file: string
  startLine: number
  endLine: number
  question: string
  answer: string
  model: string | null
  chapterId: string | null
}

interface Row {
  id: number
  repo: string
  pr_number: number
  file: string
  start_line: number
  end_line: number
  question: string
  answer: string
  model: string | null
  chapter_id: string | null
  created_at: string
}

const COLUMNS =
  'id, repo, pr_number, file, start_line, end_line, question, answer, model, chapter_id, created_at'

export class QaThreadStore extends Service {
  constructor(private readonly db: Db) {
    super()
  }

  list(repo: string, prNumber: number): QaThreadRecord[] {
    const rows = this.db.select<Row>(
      /* sql */ `
        SELECT ${COLUMNS}
          FROM qa_threads
         WHERE repo = ?
           AND pr_number = ?
         ORDER BY file, start_line, id
      `,
      [repo, prNumber],
    )
    return rows.map(toRecord)
  }

  create(input: QaThreadInput): QaThreadRecord {
    const now = new Date().toISOString()
    const result = this.db.insert(
      /* sql */ `
        INSERT INTO qa_threads
          (repo, pr_number, file, start_line, end_line, question, answer, model, chapter_id, created_at)
        VALUES
          (@repo, @prNumber, @file, @startLine, @endLine, @question, @answer, @model, @chapterId, @now)
      `,
      { ...input, now },
    )
    const id = Number(result.lastInsertRowid)
    return { ...input, id, createdAt: now }
  }

  remove(id: number): boolean {
    const { changes } = this.db.delete(
      /* sql */ `
        DELETE FROM qa_threads
         WHERE id = ?
      `,
      [id],
    )
    return changes > 0
  }
}

function toRecord(row: Row): QaThreadRecord {
  return {
    id: row.id,
    repo: row.repo,
    prNumber: row.pr_number,
    file: row.file,
    startLine: row.start_line,
    endLine: row.end_line,
    question: row.question,
    answer: row.answer,
    model: row.model,
    chapterId: row.chapter_id,
    createdAt: row.created_at,
  }
}
