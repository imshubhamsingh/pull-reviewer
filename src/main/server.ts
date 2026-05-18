import { serve, type ServerType } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Services } from '@/main/build-services'
import { logger } from '@/lib/logger'

export interface RunningServer {
  port: number
  stop: () => Promise<void>
}

export function startApiServer(services: Services): Promise<RunningServer> {
  const log = logger.child({ name: 'ApiServer' })
  const app = new Hono()

  // The renderer origin differs from the API host in dev (vite serves on
  // localhost:5173, Hono binds to 127.0.0.1). Permissive CORS is safe here —
  // the server only listens on 127.0.0.1, so no external can reach it.
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Accept'],
    }),
  )

  app.get('/health', (c) => c.json({ ok: true }))
  app.route('/api/pull-requests', services.routers.pullRequests.routes())
  app.route('/api/tours', services.routers.tours.routes())
  app.route('/api/files', services.routers.files.routes())
  app.route('/api/reviews', services.routers.reviews.routes())
  app.route('/api/hunks', services.routers.hunks.routes())
  app.route('/api/explain', services.routers.explain.routes())
  app.route('/api/chats', services.routers.chats.routes())
  app.route('/api/settings', services.routers.settings.routes())
  app.route('/api/review-progress', services.routers.reviewProgress.routes())

  return new Promise((resolve) => {
    // Bind to 127.0.0.1 explicitly. `localhost` can resolve to ::1 (IPv6) on
    // macOS/Node 20+, which Chromium's fetch may not try, producing
    // "Failed to fetch" in the renderer.
    const server: ServerType = serve(
      { fetch: app.fetch, port: 0, hostname: '127.0.0.1' },
      (info) => {
        log.info('API server listening', { port: info.port })
        resolve({
          port: info.port,
          stop: () => new Promise<void>((res) => server.close(() => res())),
        })
      },
    )
  })
}
