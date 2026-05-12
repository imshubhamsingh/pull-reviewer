import { Hono } from 'hono'
import type { FileSnapshotService } from '@/main/files/file-snapshot.service'
import { Service } from '@/main/service'

const SHA_PATTERN = /^[a-f0-9]{7,40}$/i

export class FileRouter extends Service {
  constructor(private readonly files: FileSnapshotService) {
    super()
  }

  routes(): Hono {
    const app = new Hono()

    // GET /:owner/:name/:sha/*path  →  cached file snapshot
    app.get('/:owner/:name/:sha/*', async (c) => {
      const owner = c.req.param('owner')
      const name = c.req.param('name')
      const sha = c.req.param('sha')
      const filePath = extractFilePath(c.req.path, sha)

      if (!SHA_PATTERN.test(sha)) return c.json({ error: 'invalid sha' }, 400)
      if (!filePath) return c.json({ error: 'missing path' }, 400)

      try {
        const snap = await this.files.get(`${owner}/${name}`, sha, decodeURI(filePath))
        return c.json(snap)
      } catch (err) {
        this.logger.error('File fetch failed', { err: (err as Error).message })
        return c.json({ error: (err as Error).message }, 500)
      }
    })

    return app
  }
}

/** Hono splats are captured loosely; pull the part after `/{sha}/` out of the full request path. */
function extractFilePath(reqPath: string, sha: string): string | undefined {
  const marker = `/${sha}/`
  const idx = reqPath.indexOf(marker)
  if (idx < 0) return undefined
  return reqPath.slice(idx + marker.length)
}
