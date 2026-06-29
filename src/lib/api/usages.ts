import { http } from '@/lib/api/base'
import type { UsagesInput, UsagesResult } from '@/lib/api/types'

/**
 * Find-usages client. Single POST endpoint; the backend picks TS-compiler
 * vs ripgrep based on the file extension. Errors throw via the standard
 * `http.post` ApiError path.
 */
export const usages = {
  find: (input: UsagesInput) => http.post<UsagesResult>('/api/usages', input),
}
