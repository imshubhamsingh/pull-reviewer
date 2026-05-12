export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void
  warn(msg: string, meta?: Record<string, unknown>): void
  error(msg: string, meta?: Record<string, unknown>): void
  child(bindings: { name: string }): Logger
}

class ConsoleLogger implements Logger {
  constructor(private readonly bindings: Record<string, unknown> = {}) {}

  info(msg: string, meta: Record<string, unknown> = {}): void {
    console.log(JSON.stringify({ level: 'info', t: Date.now(), ...this.bindings, msg, ...meta }))
  }

  warn(msg: string, meta: Record<string, unknown> = {}): void {
    console.warn(JSON.stringify({ level: 'warn', t: Date.now(), ...this.bindings, msg, ...meta }))
  }

  error(msg: string, meta: Record<string, unknown> = {}): void {
    console.error(JSON.stringify({ level: 'error', t: Date.now(), ...this.bindings, msg, ...meta }))
  }

  child(bindings: { name: string }): Logger {
    return new ConsoleLogger({ ...this.bindings, ...bindings })
  }
}

export const logger: Logger = new ConsoleLogger()
