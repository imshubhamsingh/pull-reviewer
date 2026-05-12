import { createTV } from 'tailwind-variants'

/**
 * Project-wide tailwind-variants factory. Wraps `createTV` so any project-
 * specific tweaks (custom class groups, theme tokens) live in one place.
 *
 * Primitives import from here; never directly from `tailwind-variants`.
 */
export const tv = createTV({})
