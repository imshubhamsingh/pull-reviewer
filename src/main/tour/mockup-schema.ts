import { z } from 'zod'

/**
 * Lo-fi UI mockup grammar. A `MockupScene` is a Figma-style flow of one or
 * more `MockupFrame`s connected by `MockupTransition`s. Each frame contains
 * primitive `MockupElement`s; the renderer paints them as SVG wireframes and
 * draws labeled arrows between frames per the transitions.
 *
 * The 22 primitives cover ~95% of UI surface a PR would touch. Anything more
 * exotic falls back to `group` + nested children. The discriminated union on
 * `type` keeps zod's validation tight and the LLM's emission predictable.
 */

const CommonFields = z.object({
  x: z.number(),
  y: z.number(),
  /** `<repo-relative-path>:<lineStart>-<lineEnd>` — enables click-to-jump on hover. */
  source: z.string().optional(),
})

const Sized = z.object({
  w: z.number(),
  h: z.number(),
})

const TextSize = z.enum(['xs', 'sm', 'md', 'lg', 'xl'])
const TextWeight = z.enum(['normal', 'medium', 'bold'])
const TextTone = z.enum(['primary', 'secondary', 'muted', 'danger'])
const ButtonVariant = z.enum(['primary', 'secondary', 'danger', 'ghost', 'icon'])
const InputKind = z.enum(['text', 'password', 'email', 'number', 'search'])
const BadgeTone = z.enum(['primary', 'secondary', 'muted', 'danger', 'success', 'warn'])
const Anchor = z.enum(['top', 'bottom', 'left', 'right'])
const Orientation = z.enum(['horizontal', 'vertical'])

/**
 * Recursive: `group` and `modal` carry `children: MockupElement[]`. zod
 * requires the TS type to be declared up-front for `z.lazy` references.
 */
export type MockupElement =
  | {
      type: 'box'
      x: number
      y: number
      w: number
      h: number
      source?: string
      label?: string
    }
  | {
      type: 'group'
      x: number
      y: number
      w: number
      h: number
      source?: string
      label?: string
      children: MockupElement[]
    }
  | { type: 'divider'; x: number; y: number; w: number; source?: string }
  | {
      type: 'spacer'
      x: number
      y: number
      w: number
      h: number
      source?: string
    }
  | {
      type: 'text'
      x: number
      y: number
      source?: string
      text: string
      size?: z.infer<typeof TextSize>
      weight?: z.infer<typeof TextWeight>
      tone?: z.infer<typeof TextTone>
    }
  | {
      type: 'link'
      x: number
      y: number
      source?: string
      text: string
      href?: string
    }
  | { type: 'code'; x: number; y: number; source?: string; text: string }
  | {
      type: 'button'
      x: number
      y: number
      w: number
      h: number
      source?: string
      label: string
      variant?: z.infer<typeof ButtonVariant>
      icon?: string
    }
  | {
      type: 'input'
      x: number
      y: number
      w: number
      h: number
      source?: string
      kind?: z.infer<typeof InputKind>
      placeholder?: string
      value?: string
    }
  | {
      type: 'textarea'
      x: number
      y: number
      w: number
      h: number
      source?: string
      placeholder?: string
      value?: string
      rows?: number
    }
  | {
      type: 'select'
      x: number
      y: number
      w: number
      h: number
      source?: string
      placeholder?: string
      value?: string
      options?: string[]
    }
  | {
      type: 'checkbox'
      x: number
      y: number
      source?: string
      label?: string
      checked: boolean
    }
  | {
      type: 'radio'
      x: number
      y: number
      source?: string
      label?: string
      checked: boolean
      groupId?: string
    }
  | {
      type: 'toggle'
      x: number
      y: number
      source?: string
      label?: string
      on: boolean
    }
  | {
      type: 'image'
      x: number
      y: number
      w: number
      h: number
      source?: string
      alt?: string
    }
  | {
      type: 'avatar'
      x: number
      y: number
      source?: string
      size?: number
      label?: string
    }
  | {
      type: 'icon'
      x: number
      y: number
      source?: string
      name: string
      size?: number
    }
  | {
      type: 'badge'
      x: number
      y: number
      source?: string
      label: string
      tone?: z.infer<typeof BadgeTone>
    }
  | {
      type: 'table'
      x: number
      y: number
      w: number
      h: number
      source?: string
      columns: string[]
      rows: string[][]
    }
  | {
      type: 'list'
      x: number
      y: number
      w: number
      h: number
      source?: string
      items: string[]
      ordered?: boolean
    }
  | {
      type: 'tabs'
      x: number
      y: number
      w: number
      h: number
      source?: string
      tabs: string[]
      activeIdx?: number
    }
  | {
      type: 'nav'
      x: number
      y: number
      w: number
      h: number
      source?: string
      items: { label: string; active?: boolean }[]
      orientation?: z.infer<typeof Orientation>
    }
  | {
      type: 'modal'
      x: number
      y: number
      w: number
      h: number
      source?: string
      title?: string
      children: MockupElement[]
    }
  | {
      type: 'tooltip'
      x: number
      y: number
      source?: string
      text: string
      anchor?: z.infer<typeof Anchor>
    }

export const MockupElementSchema: z.ZodType<MockupElement> = z.lazy(() =>
  z.discriminatedUnion('type', [
    CommonFields.merge(Sized).extend({
      type: z.literal('box'),
      label: z.string().optional(),
    }),
    CommonFields.merge(Sized).extend({
      type: z.literal('group'),
      label: z.string().optional(),
      children: z.array(MockupElementSchema).max(50),
    }),
    CommonFields.extend({ type: z.literal('divider'), w: z.number() }),
    CommonFields.merge(Sized).extend({ type: z.literal('spacer') }),
    CommonFields.extend({
      type: z.literal('text'),
      text: z.string().min(1).max(400),
      size: TextSize.optional(),
      weight: TextWeight.optional(),
      tone: TextTone.optional(),
    }),
    CommonFields.extend({
      type: z.literal('link'),
      text: z.string().min(1),
      href: z.string().optional(),
    }),
    CommonFields.extend({
      type: z.literal('code'),
      text: z.string().min(1).max(200),
    }),
    CommonFields.merge(Sized).extend({
      type: z.literal('button'),
      label: z.string(),
      variant: ButtonVariant.optional(),
      icon: z.string().optional(),
    }),
    CommonFields.merge(Sized).extend({
      type: z.literal('input'),
      kind: InputKind.optional(),
      placeholder: z.string().optional(),
      value: z.string().optional(),
    }),
    CommonFields.merge(Sized).extend({
      type: z.literal('textarea'),
      placeholder: z.string().optional(),
      value: z.string().optional(),
      rows: z.number().int().positive().optional(),
    }),
    CommonFields.merge(Sized).extend({
      type: z.literal('select'),
      placeholder: z.string().optional(),
      value: z.string().optional(),
      options: z.array(z.string()).max(20).optional(),
    }),
    CommonFields.extend({
      type: z.literal('checkbox'),
      label: z.string().optional(),
      checked: z.boolean(),
    }),
    CommonFields.extend({
      type: z.literal('radio'),
      label: z.string().optional(),
      checked: z.boolean(),
      groupId: z.string().optional(),
    }),
    CommonFields.extend({
      type: z.literal('toggle'),
      label: z.string().optional(),
      on: z.boolean(),
    }),
    CommonFields.merge(Sized).extend({
      type: z.literal('image'),
      alt: z.string().optional(),
    }),
    CommonFields.extend({
      type: z.literal('avatar'),
      size: z.number().int().positive().max(120).optional(),
      label: z.string().optional(),
    }),
    CommonFields.extend({
      type: z.literal('icon'),
      name: z.string().min(1),
      size: z.number().int().positive().max(64).optional(),
    }),
    CommonFields.extend({
      type: z.literal('badge'),
      label: z.string(),
      tone: BadgeTone.optional(),
    }),
    CommonFields.merge(Sized).extend({
      type: z.literal('table'),
      columns: z.array(z.string()).max(8),
      rows: z.array(z.array(z.string())).max(12),
    }),
    CommonFields.merge(Sized).extend({
      type: z.literal('list'),
      items: z.array(z.string()).max(30),
      ordered: z.boolean().optional(),
    }),
    CommonFields.merge(Sized).extend({
      type: z.literal('tabs'),
      tabs: z.array(z.string()).max(8),
      activeIdx: z.number().int().nonnegative().optional(),
    }),
    CommonFields.merge(Sized).extend({
      type: z.literal('nav'),
      items: z.array(z.object({ label: z.string(), active: z.boolean().optional() })).max(12),
      orientation: Orientation.optional(),
    }),
    CommonFields.merge(Sized).extend({
      type: z.literal('modal'),
      title: z.string().optional(),
      children: z.array(MockupElementSchema).max(50),
    }),
    CommonFields.extend({
      type: z.literal('tooltip'),
      text: z.string().min(1).max(200),
      anchor: Anchor.optional(),
    }),
  ]),
)

export const MockupFrameSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(80),
  width: z.number().int().positive().max(1600).default(640),
  height: z.number().int().positive().max(2400).default(480),
  /** Top-left position on the flow canvas. Optional — renderer auto-lays out when omitted. */
  canvasX: z.number().int().optional(),
  canvasY: z.number().int().optional(),
  elements: z.array(MockupElementSchema).max(120),
})

export const MockupTransitionSchema = z.object({
  fromFrame: z.string().min(1),
  toFrame: z.string().min(1),
  /** Crisp trigger label: "click Submit", "form valid", "page load — 200ms". */
  trigger: z.string().min(1).max(160),
  /** Which side of each frame the arrow attaches to. Defaults vary by relative position. */
  fromSide: Anchor.optional(),
  toSide: Anchor.optional(),
})

export const MockupSceneSchema = z.object({
  frames: z.array(MockupFrameSchema).min(1).max(8),
  transitions: z.array(MockupTransitionSchema).max(20).optional(),
})

export type MockupFrame = z.infer<typeof MockupFrameSchema>
export type MockupTransition = z.infer<typeof MockupTransitionSchema>
export type MockupScene = z.infer<typeof MockupSceneSchema>
