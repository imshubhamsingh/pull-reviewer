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
  app.route('/api/files', services.routers.files.routes())

  return new Promise((resolve) => {
    // Bind to 127.0.0.1 explicitly. `localhost` can resolve to ::1 (IPv6) on
    // macOS/Node 20+, which Chromium's fetch may not try, producing
    // "Failed to fetch" in the renderer.
    const server: ServerType = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
      log.info('API server listening', { port: info.port })
      resolve({
        port: info.port,
        stop: () => new Promise<void>((res) => server.close(() => res())),
      })
    })
  })
}
