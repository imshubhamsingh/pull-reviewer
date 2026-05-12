import { serve, type ServerType } from '@hono/node-server'
import { Hono } from 'hono'
import type { Services } from '@/main/build-services'
import { logger } from '@/lib/logger'

export interface RunningServer {
  port: number
  stop: () => Promise<void>
}

export function startApiServer(services: Services): Promise<RunningServer> {
  const log = logger.child({ name: 'ApiServer' })
  const app = new Hono()

  app.get('/health', (c) => c.json({ ok: true }))
  app.route('/api/pull-requests', services.routers.pullRequests.routes())
  app.route('/api/tours', services.routers.tours.routes())

  return new Promise((resolve) => {
    const server: ServerType = serve({ fetch: app.fetch, port: 0 }, (info) => {
      log.info('API server listening', { port: info.port })
      resolve({
        port: info.port,
        stop: () => new Promise<void>((res) => server.close(() => res())),
      })
    })
  })
}
