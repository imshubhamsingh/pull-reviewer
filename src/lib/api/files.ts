import { http } from '@/lib/api/base'
import type { FileSnapshot } from '@/lib/api/types'

export const files = {
  /** Read a file at a given sha. Read-through cache; fast on repeat reads. */
  get: (repo: string, sha: string, path: string) =>
    http.get<FileSnapshot>(`/api/files/${repo}/${sha}/${encodeURI(path)}`),
}
