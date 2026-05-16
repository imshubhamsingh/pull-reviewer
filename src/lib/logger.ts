import pino, { type Logger as PinoLogger } from 'pino'

/**
 * Structured logger contract. Implementations write one log record per call;
 * meta is merged with any bindings established via `child()`.
 */
export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void
  warn(msg: string, meta?: Record<string, unknown>): void
  error(msg: string, meta?: Record<string, unknown>): void
  child(bindings: { name: string }): Logger
}

/**
 * Adapter that exposes our `Logger` API on top of a pino instance.
 *
 * Why this shape:
 *  - Callers use `log.info(msg, meta)` — message first, meta second. Pino's
 *    native signature is the inverse (`log.info(meta, msg)`); we swap here so
 *    services don't have to know.
 *  - `child({ name })` maps to pino's `child(bindings)` so the per-class child
 *    loggers established in `Service` keep working unchanged.
 *  - No transports / workers — synchronous JSON output suits an Electron
 *    desktop app and avoids Vite-bundling pitfalls.
 */
class PinoLoggerAdapter implements Logger {
  constructor(private readonly log: PinoLogger) {}

  info(msg: string, meta: Record<string, unknown> = {}): void {
    this.log.info(meta, msg)
  }

  warn(msg: string, meta: Record<string, unknown> = {}): void {
    this.log.warn(meta, msg)
  }

  error(msg: string, meta: Record<string, unknown> = {}): void {
    this.log.error(meta, msg)
  }

  child(bindings: { name: string }): Logger {
    return new PinoLoggerAdapter(this.log.child(bindings))
  }
}

function createRoot(): PinoLogger {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: undefined, // drop hostname/pid; we don't need them in a desktop app
    timestamp: pino.stdTimeFunctions.isoTime,
  })
}

export const logger: Logger = new PinoLoggerAdapter(createRoot())
