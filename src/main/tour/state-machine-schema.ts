import { z } from 'zod'
import { createMachine } from 'xstate'

/**
 * XState v5-shaped state machine config — the wire format for a
 * `kind: 'state'` diagram. The model emits a subset of XState's machine
 * config; we validate structurally via zod and semantically via
 * `createMachine(config)` (which catches undefined transition targets and
 * compound states without `initial`).
 *
 * v1 supports atomic, compound, and final states. Parallel regions, history
 * pseudo-states, and invoked actors are intentionally out of scope.
 */

const StringOrStringArray = z.union([
  z.string().min(1).max(80),
  z.array(z.string().min(1).max(80)).max(6),
])

// A transition can be either a target name (string shorthand) or a full
// object. Both forms work because the LLM's emission style varies.
const TransitionSchema = z.union([
  z.string().min(1),
  z.object({
    target: z.string().min(1).optional(),
    /**
     * Human-readable guard description (`"payload valid"`, `"retries < 3"`).
     * Not executable — xstate treats unknown string guards as no-ops at
     * runtime; we only render the label.
     */
    cond: z.string().min(1).max(120).optional(),
    actions: z.array(z.string().min(1).max(80)).max(6).optional(),
    /** `<repo-relative path>:<lineStart>-<lineEnd>` for click-to-jump. */
    source: z.string().optional(),
  }),
])

/**
 * Recursive: compound states carry nested `states`. zod requires the TS
 * type to be declared up-front for `z.lazy` references.
 */
export type Transition = z.infer<typeof TransitionSchema>
export type StateNode = {
  id?: string
  type?: 'atomic' | 'compound' | 'final'
  entry?: string | string[]
  exit?: string | string[]
  on?: Record<string, Transition | Transition[]>
  states?: Record<string, StateNode>
  initial?: string
  source?: string
}

export const StateNodeSchema: z.ZodType<StateNode> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1).optional(),
      type: z.enum(['atomic', 'compound', 'final']).optional(),
      entry: StringOrStringArray.optional(),
      exit: StringOrStringArray.optional(),
      on: z
        .record(z.string().min(1), z.union([TransitionSchema, z.array(TransitionSchema).max(8)]))
        .optional(),
      states: z.record(z.string().min(1), StateNodeSchema).optional(),
      initial: z.string().min(1).optional(),
      source: z.string().optional(),
    })
    .refine((n) => !(n.type === 'compound' && !n.initial), {
      message: 'compound state requires `initial`',
    })
    // A state with nested `states` but no `initial` is also a broken compound.
    .refine((n) => !(n.states && Object.keys(n.states).length > 0 && !n.initial), {
      message: 'state with nested `states` requires `initial`',
    }),
)

export const StateMachineSchema = z
  .object({
    id: z.string().min(1).max(80),
    initial: z.string().min(1),
    source: z.string().optional(),
    states: z.record(z.string().min(1), StateNodeSchema),
  })
  .refine((m) => m.initial in m.states, {
    message: '`initial` must reference a state defined in `states`',
    path: ['initial'],
  })
  // Defer to xstate for cross-reference checks (undefined transition targets,
  // missing initial on nested compounds, etc.). createMachine accepts our
  // descriptive `cond`/`actions` strings as unresolved references — those
  // are fine at config-build time.
  .superRefine((m, ctx) => {
    try {
      createMachine(m as Parameters<typeof createMachine>[0])
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : 'invalid state machine',
      })
    }
  })

export type StateMachine = z.infer<typeof StateMachineSchema>
