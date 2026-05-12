import { logger as rootLogger, type Logger } from '@/lib/logger'

export class Service {
  protected readonly logger: Logger

  constructor() {
    this.logger = rootLogger.child({ name: this.constructor.name })
  }
}
