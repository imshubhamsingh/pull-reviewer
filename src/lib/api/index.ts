/**
 * Public API surface. Per-domain namespaces (prs, tours, files, reviews, qa,
 * chats, settings) live in their own files; this module composes them into a
 * single `api` object and re-exports the shared types + error class.
 */

import { chats } from '@/lib/api/chats'
import { files } from '@/lib/api/files'
import { prs } from '@/lib/api/prs'
import { qa } from '@/lib/api/qa'
import { reviewProgress } from '@/lib/api/review-progress'
import { reviews } from '@/lib/api/reviews'
import { settings } from '@/lib/api/settings'
import { tours } from '@/lib/api/tours'

export const api = { prs, tours, files, reviews, qa, chats, settings, reviewProgress }

export { http, getBaseUrl, ApiError } from '@/lib/api/base'
export type { AskStreamEvent } from '@/lib/api/qa'
export type { ChatStreamEvent } from '@/lib/api/chats'
export type { TourStreamEvent } from '@/lib/api/tours'
export type * from '@/lib/api/types'
