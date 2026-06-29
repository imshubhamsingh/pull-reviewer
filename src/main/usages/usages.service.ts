import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
import { Service } from '@/main/service'
import type { GitCloneManager } from '@/main/git/clone.manager'

export interface UsagesInput {
  repo: string
  sha: string
  /** Repo-relative path of the file the user is in. */
  file: string
  /** 1-based line of the click. */
  line: number
  /** 0-based column of the click. */
  column: number
  /** 'references' = all usages; 'definition' = declaration site only. */
  kind: 'references' | 'definition'
  signal?: AbortSignal
}

export interface UsageHit {
  file: string
  line: number
  column: number
  /** Full source line for that hit, untrimmed. */
  lineText: string
  /** Inclusive byte offset of the match start within `lineText`. */
  matchStart: number
  /** Exclusive byte offset of the match end within `lineText`. */
  matchEnd: number
  /** 'def' when the engine can identify the declaration site; otherwise 'ref'. */
  classification: 'def' | 'ref'
}

export interface UsagesResult {
  /** The identifier the engine actually searched (resolved from line+column). */
  symbol: string
  hits: UsageHit[]
  engine: 'typescript' | 'ripgrep'
  durationMs: number
}

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const IDENT_RE = /[A-Za-z_$][\w$]*/g
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.vite', 'out', 'coverage'])
const TS_CACHE_LIMIT = 4
const RG_MATCH_LIMIT = 500
const DEFAULT_COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  jsx: ts.JsxEmit.Preserve,
  allowJs: true,
  checkJs: false,
  esModuleInterop: true,
  skipLibCheck: true,
}

interface TsCacheEntry {
  worktree: string
  service: ts.LanguageService
  files: string[]
  fileSet: Set<string>
}

/**
 * Find-usages engine. TS / JS files go through `ts.createLanguageService`
 * (the same engine VSCode / WebStorm use); other languages use ripgrep with
 * word-boundary matching + a comment/string heuristic.
 *
 * LanguageService instances are cached per `(repo, sha)` with LRU eviction
 * (`TS_CACHE_LIMIT` live entries). Warm-up on first invocation per worktree
 * is multi-second on a large repo; subsequent calls are sub-100 ms.
 */
export class UsagesService extends Service {
  private readonly tsCache = new Map<string, TsCacheEntry>()

  constructor(private readonly clones: GitCloneManager) {
    super()
  }

  async find(input: UsagesInput): Promise<UsagesResult> {
    const started = performance.now()
    const worktree = await this.clones.ensureWorktree(input.repo, input.sha)
    const ext = path.extname(input.file).toLowerCase()
    if (TS_EXTENSIONS.has(ext)) {
      return this.findViaTypescript(worktree, input, started)
    }
    return this.findViaRipgrep(worktree, input, started)
  }

  // -------- TypeScript strategy ---------

  private findViaTypescript(worktree: string, input: UsagesInput, started: number): UsagesResult {
    const entry = this.tsServiceFor(input.repo, input.sha, worktree)
    const absPath = path.resolve(worktree, input.file)
    if (!entry.fileSet.has(absPath)) {
      this.logger.warn('Usages: target file not in TS program', { absPath })
      return emptyResult('typescript', '', started)
    }
    const sourceText = entry.service.getProgram()?.getSourceFile(absPath)?.text
    if (!sourceText) return emptyResult('typescript', '', started)
    const position = lineColumnToOffset(sourceText, input.line, input.column)
    const symbol = symbolAtPosition(sourceText, position)
    if (!symbol) return emptyResult('typescript', '', started)

    const hits =
      input.kind === 'definition'
        ? this.tsDefinitions(entry, absPath, position)
        : this.tsReferences(entry, absPath, position)
    return {
      symbol,
      hits: hits.map((h) => ({ ...h, file: path.relative(worktree, h.file) })),
      engine: 'typescript',
      durationMs: Math.round(performance.now() - started),
    }
  }

  private tsReferences(entry: TsCacheEntry, absPath: string, position: number): UsageHit[] {
    const refs = entry.service.findReferences(absPath, position)
    if (!refs) return []
    const hits: UsageHit[] = []
    for (const ref of refs) {
      for (const e of ref.references) {
        const hit = entryToHit(
          entry,
          e.fileName,
          e.textSpan.start,
          e.textSpan.length,
          e.isDefinition ? 'def' : 'ref',
        )
        if (hit) hits.push(hit)
      }
    }
    return hits
  }

  private tsDefinitions(entry: TsCacheEntry, absPath: string, position: number): UsageHit[] {
    const defs = entry.service.getDefinitionAtPosition(absPath, position)
    if (!defs) return []
    const hits: UsageHit[] = []
    for (const d of defs) {
      const hit = entryToHit(entry, d.fileName, d.textSpan.start, d.textSpan.length, 'def')
      if (hit) hits.push(hit)
    }
    return hits
  }

  /** Get or build the LanguageService for a (repo, sha) — LRU-cached. */
  private tsServiceFor(repo: string, sha: string, worktree: string): TsCacheEntry {
    const key = `${repo}@${sha}`
    const cached = this.tsCache.get(key)
    if (cached) {
      // Touch for LRU.
      this.tsCache.delete(key)
      this.tsCache.set(key, cached)
      return cached
    }
    if (this.tsCache.size >= TS_CACHE_LIMIT) {
      const oldest = this.tsCache.keys().next().value
      if (oldest) this.tsCache.delete(oldest)
    }
    const entry = this.buildTsService(worktree)
    this.tsCache.set(key, entry)
    this.logger.info('Usages: built TS LanguageService', {
      worktree,
      files: entry.files.length,
    })
    return entry
  }

  private buildTsService(worktree: string): TsCacheEntry {
    const files = collectTsFiles(worktree)
    const fileSet = new Set(files)
    const compilerOptions = readCompilerOptions(worktree)
    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => files,
      getScriptVersion: () => '1',
      getScriptSnapshot: (name) => {
        try {
          return ts.ScriptSnapshot.fromString(fs.readFileSync(name, 'utf8'))
        } catch {
          return undefined
        }
      },
      getCurrentDirectory: () => worktree,
      getCompilationSettings: () => compilerOptions,
      getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    }
    const service = ts.createLanguageService(host, ts.createDocumentRegistry())
    return { worktree, service, files, fileSet }
  }

  // -------- Ripgrep strategy ---------

  private async findViaRipgrep(
    worktree: string,
    input: UsagesInput,
    started: number,
  ): Promise<UsagesResult> {
    if (input.kind === 'definition') {
      // No semantic understanding without a language service — return empty.
      return emptyResult('ripgrep', '', started)
    }
    const absPath = path.resolve(worktree, input.file)
    let sourceText: string
    try {
      sourceText = fs.readFileSync(absPath, 'utf8')
    } catch {
      return emptyResult('ripgrep', '', started)
    }
    const lineText = nthLine(sourceText, input.line)
    if (!lineText) return emptyResult('ripgrep', '', started)
    const symbol = symbolFromLine(lineText, input.column)
    if (!symbol) return emptyResult('ripgrep', '', started)

    const hits = await this.rgSearch(worktree, symbol, input.signal)
    return {
      symbol,
      hits: hits.filter(
        (h) => !isCommentLine(h.lineText) && !isInsideString(h.lineText, h.matchStart),
      ),
      engine: 'ripgrep',
      durationMs: Math.round(performance.now() - started),
    }
  }

  private rgSearch(worktree: string, symbol: string, signal?: AbortSignal): Promise<UsageHit[]> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        'rg',
        [
          '--json',
          '--word-regexp',
          '--no-heading',
          '-m',
          String(RG_MATCH_LIMIT),
          '--',
          symbol,
          worktree,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
      const onAbort = () => child.kill('SIGTERM')
      signal?.addEventListener('abort', onAbort, { once: true })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (c: Buffer) => {
        stdout += c.toString()
      })
      child.stderr.on('data', (c: Buffer) => {
        stderr += c.toString()
      })
      child.on('error', (err) => {
        signal?.removeEventListener('abort', onAbort)
        reject(err)
      })
      child.on('close', (code) => {
        signal?.removeEventListener('abort', onAbort)
        // rg exits 1 when there are no matches — not an error.
        if (code !== 0 && code !== 1) {
          this.logger.warn('rg exited non-zero', { code, stderrPreview: stderr.slice(0, 200) })
          return resolve([])
        }
        resolve(parseRgJson(stdout, worktree))
      })
    })
  }
}

// -------- Helpers ---------

function emptyResult(
  engine: 'typescript' | 'ripgrep',
  symbol: string,
  started: number,
): UsagesResult {
  return { symbol, hits: [], engine, durationMs: Math.round(performance.now() - started) }
}

/** Convert (line: 1-based, column: 0-based) to a UTF-16 offset into `text`. */
function lineColumnToOffset(text: string, line: number, column: number): number {
  let offset = 0
  let currentLine = 1
  while (currentLine < line && offset < text.length) {
    const nl = text.indexOf('\n', offset)
    if (nl < 0) return text.length
    offset = nl + 1
    currentLine++
  }
  return Math.min(offset + column, text.length)
}

/** Return the identifier whose char range straddles `position`, if any. */
function symbolAtPosition(text: string, position: number): string {
  const lineStart = text.lastIndexOf('\n', position - 1) + 1
  const lineEnd = text.indexOf('\n', position)
  const line = text.slice(lineStart, lineEnd < 0 ? undefined : lineEnd)
  return symbolFromLine(line, position - lineStart)
}

function symbolFromLine(line: string, column: number): string {
  IDENT_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = IDENT_RE.exec(line)) !== null) {
    if (column >= m.index && column <= m.index + m[0].length) {
      return m[0]
    }
  }
  return ''
}

function nthLine(text: string, line: number): string {
  let offset = 0
  let currentLine = 1
  while (currentLine < line && offset < text.length) {
    const nl = text.indexOf('\n', offset)
    if (nl < 0) return ''
    offset = nl + 1
    currentLine++
  }
  const end = text.indexOf('\n', offset)
  return text.slice(offset, end < 0 ? undefined : end)
}

function entryToHit(
  entry: TsCacheEntry,
  file: string,
  pos: number,
  length: number,
  classification: 'def' | 'ref',
): UsageHit | undefined {
  const source = entry.service.getProgram()?.getSourceFile(file)?.text
  if (!source) return undefined
  const lineStart = source.lastIndexOf('\n', pos - 1) + 1
  const lineEndRaw = source.indexOf('\n', pos)
  const lineEnd = lineEndRaw < 0 ? source.length : lineEndRaw
  const lineText = source.slice(lineStart, lineEnd)
  const line = source.slice(0, lineStart).split('\n').length
  return {
    file,
    line,
    column: pos - lineStart,
    lineText,
    matchStart: pos - lineStart,
    matchEnd: pos - lineStart + length,
    classification,
  }
}

interface RgMatchSubmatch {
  match: { text: string }
  start: number
  end: number
}

interface RgMatchEvent {
  type: 'match'
  data: {
    path: { text: string }
    lines: { text: string }
    line_number: number
    submatches: RgMatchSubmatch[]
  }
}

function parseRgJson(stdout: string, worktree: string): UsageHit[] {
  const hits: UsageHit[] = []
  for (const line of stdout.split('\n')) {
    if (!line) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    if (!isRgMatchEvent(parsed)) continue
    const filePath = parsed.data.path.text
    const rel = path.relative(worktree, filePath)
    const lineText = parsed.data.lines.text.replace(/\n$/, '')
    for (const sm of parsed.data.submatches) {
      hits.push({
        file: rel,
        line: parsed.data.line_number,
        column: sm.start,
        lineText,
        matchStart: sm.start,
        matchEnd: sm.end,
        classification: 'ref',
      })
    }
  }
  return hits
}

function isRgMatchEvent(v: unknown): v is RgMatchEvent {
  if (!v || typeof v !== 'object') return false
  const o = v as { type?: unknown; data?: unknown }
  if (o.type !== 'match' || !o.data || typeof o.data !== 'object') return false
  const d = o.data as {
    path?: unknown
    lines?: unknown
    line_number?: unknown
    submatches?: unknown
  }
  return (
    typeof d.line_number === 'number' &&
    typeof d.path === 'object' &&
    typeof d.lines === 'object' &&
    Array.isArray(d.submatches)
  )
}

function isCommentLine(lineText: string): boolean {
  const trimmed = lineText.trimStart()
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('#')
  )
}

/** Cheap heuristic: count unescaped quote chars before `pos`; odd = inside. */
function isInsideString(lineText: string, pos: number): boolean {
  let singles = 0
  let doubles = 0
  let backticks = 0
  for (let i = 0; i < pos && i < lineText.length; i++) {
    const ch = lineText[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === "'") singles++
    else if (ch === '"') doubles++
    else if (ch === '`') backticks++
  }
  return singles % 2 === 1 || doubles % 2 === 1 || backticks % 2 === 1
}

function collectTsFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        walk(full)
      } else if (e.isFile() && TS_EXTENSIONS.has(path.extname(e.name).toLowerCase())) {
        out.push(full)
      }
    }
  }
  walk(root)
  return out
}

function readCompilerOptions(worktree: string): ts.CompilerOptions {
  const configPath = ts.findConfigFile(worktree, ts.sys.fileExists, 'tsconfig.json')
  if (!configPath) return DEFAULT_COMPILER_OPTIONS
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile)
  if (error || !config) return DEFAULT_COMPILER_OPTIONS
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(configPath))
  return { ...DEFAULT_COMPILER_OPTIONS, ...parsed.options }
}
