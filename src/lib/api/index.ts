/**
 * Public API surface. Per-domain namespaces (prs, tours, files, reviews, qa)
 * live in their own files; this module composes them into a single `api`
 * object and re-exports the shared types + error class.
 */

import { files } from '@/lib/api/files'
import { prs } from '@/lib/api/prs'
import { qa } from '@/lib/api/qa'
import { reviews } from '@/lib/api/reviews'
import { tours } from '@/lib/api/tours'

export const api = { prs, tours, files, reviews, qa }

export { http, getBaseUrl, ApiError } from '@/lib/api/base'
export type { AskStreamEvent } from '@/lib/api/qa'
export type { TourStreamEvent } from '@/lib/api/tours'
export type * from '@/lib/api/types'
