import type { JSX } from 'react'
import { match } from 'ts-pattern'
import type { MockupElement } from '@/lib/api'
import { parseSourceRef, type SourceRef } from '@/app/components/mockup-source'

/**
 * SVG renderer for each of the 22 mockup primitives. Style is intentionally
 * minimal — black/white/gray wireframe palette via the CSS color tokens
 * (`var(--color-*)`). One small component per primitive; `Element` dispatches
 * via ts-pattern's exhaustive match. When the element carries a `source`
 * annotation, the wrapper makes it clickable + adds a native SVG title.
 */

export type JumpSource = (ref: SourceRef) => void

interface Props {
  el: MockupElement
  onJumpSource?: JumpSource
}

export function Element({ el, onJumpSource }: Props): JSX.Element {
  const variant = match(el)
    .with({ type: 'box' }, (e) => <BoxEl el={e} />)
    .with({ type: 'group' }, (e) => <GroupEl el={e} onJumpSource={onJumpSource} />)
    .with({ type: 'divider' }, (e) => <DividerEl el={e} />)
    .with({ type: 'spacer' }, () => <></>)
    .with({ type: 'text' }, (e) => <TextEl el={e} />)
    .with({ type: 'link' }, (e) => <LinkEl el={e} />)
    .with({ type: 'code' }, (e) => <CodeEl el={e} />)
    .with({ type: 'button' }, (e) => <ButtonEl el={e} />)
    .with({ type: 'input' }, (e) => <InputEl el={e} />)
    .with({ type: 'textarea' }, (e) => <TextareaEl el={e} />)
    .with({ type: 'select' }, (e) => <SelectEl el={e} />)
    .with({ type: 'checkbox' }, (e) => <CheckboxEl el={e} />)
    .with({ type: 'radio' }, (e) => <RadioEl el={e} />)
    .with({ type: 'toggle' }, (e) => <ToggleEl el={e} />)
    .with({ type: 'image' }, (e) => <ImageEl el={e} />)
    .with({ type: 'avatar' }, (e) => <AvatarEl el={e} />)
    .with({ type: 'icon' }, (e) => <IconEl el={e} />)
    .with({ type: 'badge' }, (e) => <BadgeEl el={e} />)
    .with({ type: 'table' }, (e) => <TableEl el={e} />)
    .with({ type: 'list' }, (e) => <ListEl el={e} />)
    .with({ type: 'tabs' }, (e) => <TabsEl el={e} />)
    .with({ type: 'nav' }, (e) => <NavEl el={e} />)
    .with({ type: 'modal' }, (e) => <ModalEl el={e} onJumpSource={onJumpSource} />)
    .with({ type: 'tooltip' }, (e) => <TooltipEl el={e} />)
    .exhaustive()
  return (
    <SourceWrap source={el.source} onJumpSource={onJumpSource}>
      {variant}
    </SourceWrap>
  )
}

interface SourceWrapProps {
  source: string | undefined
  onJumpSource: JumpSource | undefined
  children: JSX.Element
}

function SourceWrap({ source, onJumpSource, children }: SourceWrapProps): JSX.Element {
  if (!source) return children
  const ref = parseSourceRef(source)
  const onClick = ref && onJumpSource ? () => onJumpSource(ref) : undefined
  return (
    <g style={onClick ? { cursor: 'pointer' } : undefined} onClick={onClick}>
      <title>{source}</title>
      {children}
    </g>
  )
}

const STROKE = 'var(--color-border-strong)'
const FILL_BG = 'var(--color-bg)'
const FILL_SURFACE = 'var(--color-surface)'
const FILL_SURFACE_HOVER = 'var(--color-surface-hover)'

const FONT_PX: Record<NonNullable<Extract<MockupElement, { type: 'text' }>['size']>, number> = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 18,
  xl: 24,
}

const TONE_COLOR: Record<NonNullable<Extract<MockupElement, { type: 'text' }>['tone']>, string> = {
  primary: 'var(--color-text-primary)',
  secondary: 'var(--color-text-secondary)',
  muted: 'var(--color-text-muted)',
  danger: 'var(--color-text-danger)',
}

const BADGE_COLOR: Record<
  NonNullable<Extract<MockupElement, { type: 'badge' }>['tone']>,
  string
> = {
  primary: 'var(--color-text-brand)',
  secondary: 'var(--color-text-secondary)',
  muted: 'var(--color-text-muted)',
  danger: 'var(--color-text-danger)',
  success: 'hsl(140 60% 55%)',
  warn: 'hsl(38 90% 60%)',
}

function BoxEl({ el }: { el: Extract<MockupElement, { type: 'box' }> }): JSX.Element {
  return (
    <g>
      <rect
        x={el.x}
        y={el.y}
        width={el.w}
        height={el.h}
        fill={FILL_SURFACE}
        stroke={STROKE}
        rx={4}
      />
      {el.label && (
        <text x={el.x + 8} y={el.y + 16} fontSize={12} fill="var(--color-text-secondary)">
          {el.label}
        </text>
      )}
    </g>
  )
}

function GroupEl({
  el,
  onJumpSource,
}: {
  el: Extract<MockupElement, { type: 'group' }>
  onJumpSource?: JumpSource
}): JSX.Element {
  return (
    <g transform={`translate(${el.x} ${el.y})`}>
      <rect
        x={0}
        y={0}
        width={el.w}
        height={el.h}
        fill={FILL_BG}
        stroke={STROKE}
        strokeDasharray="4 3"
        rx={4}
      />
      {el.label && (
        <text x={8} y={14} fontSize={11} fill="var(--color-text-muted)">
          {el.label}
        </text>
      )}
      {el.children.map((child, i) => (
        <Element key={i} el={child} onJumpSource={onJumpSource} />
      ))}
    </g>
  )
}

function DividerEl({ el }: { el: Extract<MockupElement, { type: 'divider' }> }): JSX.Element {
  return <line x1={el.x} y1={el.y} x2={el.x + el.w} y2={el.y} stroke={STROKE} strokeWidth={1} />
}

function TextEl({ el }: { el: Extract<MockupElement, { type: 'text' }> }): JSX.Element {
  const fontSize = FONT_PX[el.size ?? 'md']
  const color = TONE_COLOR[el.tone ?? 'primary']
  const fontWeight = el.weight === 'bold' ? 700 : el.weight === 'medium' ? 500 : 400
  return (
    <text x={el.x} y={el.y + fontSize} fontSize={fontSize} fontWeight={fontWeight} fill={color}>
      {el.text}
    </text>
  )
}

function LinkEl({ el }: { el: Extract<MockupElement, { type: 'link' }> }): JSX.Element {
  const fontSize = 12
  return (
    <text
      x={el.x}
      y={el.y + fontSize}
      fontSize={fontSize}
      fill="var(--color-text-brand)"
      textDecoration="underline"
    >
      {el.text}
    </text>
  )
}

function CodeEl({ el }: { el: Extract<MockupElement, { type: 'code' }> }): JSX.Element {
  const w = Math.max(40, el.text.length * 7 + 12)
  const h = 20
  return (
    <g>
      <rect
        x={el.x}
        y={el.y}
        width={w}
        height={h}
        rx={3}
        fill={FILL_SURFACE_HOVER}
        stroke={STROKE}
      />
      <text
        x={el.x + 6}
        y={el.y + 14}
        fontFamily="ui-monospace, monospace"
        fontSize={11}
        fill="var(--color-text-primary)"
      >
        {el.text}
      </text>
    </g>
  )
}

const BUTTON_FILL: Record<
  NonNullable<Extract<MockupElement, { type: 'button' }>['variant']>,
  string
> = {
  primary: 'var(--color-interactive-primary)',
  secondary: 'var(--color-interactive-secondary)',
  danger: 'var(--color-interactive-danger)',
  ghost: 'transparent',
  icon: 'transparent',
}
const BUTTON_TEXT: Record<
  NonNullable<Extract<MockupElement, { type: 'button' }>['variant']>,
  string
> = {
  primary: 'var(--color-interactive-primary-fg)',
  secondary: 'var(--color-text-primary)',
  danger: 'var(--color-interactive-primary-fg)',
  ghost: 'var(--color-text-secondary)',
  icon: 'var(--color-text-secondary)',
}

function ButtonEl({ el }: { el: Extract<MockupElement, { type: 'button' }> }): JSX.Element {
  const variant = el.variant ?? 'secondary'
  return (
    <g>
      <rect
        x={el.x}
        y={el.y}
        width={el.w}
        height={el.h}
        rx={6}
        fill={BUTTON_FILL[variant]}
        stroke={variant === 'ghost' || variant === 'icon' ? STROKE : 'none'}
      />
      <text
        x={el.x + el.w / 2}
        y={el.y + el.h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontWeight={500}
        fill={BUTTON_TEXT[variant]}
      >
        {el.label}
      </text>
    </g>
  )
}

function InputEl({ el }: { el: Extract<MockupElement, { type: 'input' }> }): JSX.Element {
  const display = el.value || el.placeholder || ''
  const tone = el.value ? 'var(--color-text-primary)' : 'var(--color-text-muted)'
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={4} fill={FILL_BG} stroke={STROKE} />
      <text x={el.x + 10} y={el.y + el.h / 2} dominantBaseline="central" fontSize={12} fill={tone}>
        {display}
      </text>
    </g>
  )
}

function TextareaEl({ el }: { el: Extract<MockupElement, { type: 'textarea' }> }): JSX.Element {
  const display = el.value || el.placeholder || ''
  const tone = el.value ? 'var(--color-text-primary)' : 'var(--color-text-muted)'
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={4} fill={FILL_BG} stroke={STROKE} />
      <text x={el.x + 10} y={el.y + 16} fontSize={12} fill={tone}>
        {display}
      </text>
    </g>
  )
}

function SelectEl({ el }: { el: Extract<MockupElement, { type: 'select' }> }): JSX.Element {
  const display = el.value || el.placeholder || ''
  const tone = el.value ? 'var(--color-text-primary)' : 'var(--color-text-muted)'
  const caretX = el.x + el.w - 14
  const caretY = el.y + el.h / 2
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={4} fill={FILL_BG} stroke={STROKE} />
      <text x={el.x + 10} y={caretY} dominantBaseline="central" fontSize={12} fill={tone}>
        {display}
      </text>
      <path
        d={`M ${caretX - 4} ${caretY - 2} L ${caretX} ${caretY + 3} L ${caretX + 4} ${caretY - 2}`}
        stroke="var(--color-text-muted)"
        fill="none"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </g>
  )
}

function CheckboxEl({ el }: { el: Extract<MockupElement, { type: 'checkbox' }> }): JSX.Element {
  const size = 16
  return (
    <g>
      <rect
        x={el.x}
        y={el.y}
        width={size}
        height={size}
        rx={3}
        fill={el.checked ? 'var(--color-interactive-primary)' : FILL_BG}
        stroke={STROKE}
      />
      {el.checked && (
        <path
          d={`M ${el.x + 3} ${el.y + 8} L ${el.x + 7} ${el.y + 12} L ${el.x + 13} ${el.y + 4}`}
          stroke="var(--color-interactive-primary-fg)"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
      )}
      {el.label && (
        <text
          x={el.x + size + 8}
          y={el.y + size / 2}
          dominantBaseline="central"
          fontSize={12}
          fill="var(--color-text-primary)"
        >
          {el.label}
        </text>
      )}
    </g>
  )
}

function RadioEl({ el }: { el: Extract<MockupElement, { type: 'radio' }> }): JSX.Element {
  const r = 8
  const cx = el.x + r
  const cy = el.y + r
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={FILL_BG} stroke={STROKE} />
      {el.checked && <circle cx={cx} cy={cy} r={4} fill="var(--color-interactive-primary)" />}
      {el.label && (
        <text
          x={el.x + r * 2 + 8}
          y={cy}
          dominantBaseline="central"
          fontSize={12}
          fill="var(--color-text-primary)"
        >
          {el.label}
        </text>
      )}
    </g>
  )
}

function ToggleEl({ el }: { el: Extract<MockupElement, { type: 'toggle' }> }): JSX.Element {
  const w = 32
  const h = 18
  const knobR = (h - 4) / 2
  const knobCx = el.on ? el.x + w - knobR - 2 : el.x + knobR + 2
  return (
    <g>
      <rect
        x={el.x}
        y={el.y}
        width={w}
        height={h}
        rx={h / 2}
        fill={el.on ? 'var(--color-interactive-primary)' : FILL_SURFACE}
        stroke={STROKE}
      />
      <circle cx={knobCx} cy={el.y + h / 2} r={knobR} fill="var(--color-text-primary)" />
      {el.label && (
        <text
          x={el.x + w + 8}
          y={el.y + h / 2}
          dominantBaseline="central"
          fontSize={12}
          fill="var(--color-text-primary)"
        >
          {el.label}
        </text>
      )}
    </g>
  )
}

function ImageEl({ el }: { el: Extract<MockupElement, { type: 'image' }> }): JSX.Element {
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.w} height={el.h} fill={FILL_SURFACE} stroke={STROKE} />
      <line
        x1={el.x}
        y1={el.y}
        x2={el.x + el.w}
        y2={el.y + el.h}
        stroke="var(--color-text-muted)"
      />
      <line
        x1={el.x + el.w}
        y1={el.y}
        x2={el.x}
        y2={el.y + el.h}
        stroke="var(--color-text-muted)"
      />
    </g>
  )
}

function AvatarEl({ el }: { el: Extract<MockupElement, { type: 'avatar' }> }): JSX.Element {
  const size = el.size ?? 32
  const r = size / 2
  const cx = el.x + r
  const cy = el.y + r
  const initials = (el.label ?? '').slice(0, 2).toUpperCase()
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={FILL_SURFACE_HOVER} stroke={STROKE} />
      {initials && (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.max(10, size * 0.4)}
          fill="var(--color-text-secondary)"
        >
          {initials}
        </text>
      )}
    </g>
  )
}

function IconEl({ el }: { el: Extract<MockupElement, { type: 'icon' }> }): JSX.Element {
  const size = el.size ?? 16
  return (
    <g>
      <rect
        x={el.x}
        y={el.y}
        width={size}
        height={size}
        rx={3}
        fill={FILL_SURFACE}
        stroke={STROKE}
      />
      <text
        x={el.x + size / 2}
        y={el.y + size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={Math.max(8, size * 0.45)}
        fill="var(--color-text-muted)"
      >
        {el.name.slice(0, 2)}
      </text>
    </g>
  )
}

function BadgeEl({ el }: { el: Extract<MockupElement, { type: 'badge' }> }): JSX.Element {
  const w = Math.max(24, el.label.length * 7 + 14)
  const h = 18
  const fill = BADGE_COLOR[el.tone ?? 'secondary']
  return (
    <g>
      <rect x={el.x} y={el.y} width={w} height={h} rx={h / 2} fill="transparent" stroke={fill} />
      <text
        x={el.x + w / 2}
        y={el.y + h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
        fill={fill}
      >
        {el.label}
      </text>
    </g>
  )
}

function TableEl({ el }: { el: Extract<MockupElement, { type: 'table' }> }): JSX.Element {
  const cols = el.columns.length || 1
  const rows = el.rows.length
  const headerH = 24
  const rowH = rows > 0 ? (el.h - headerH) / rows : 0
  const colW = el.w / cols
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.w} height={el.h} fill={FILL_BG} stroke={STROKE} />
      <rect x={el.x} y={el.y} width={el.w} height={headerH} fill={FILL_SURFACE} stroke={STROKE} />
      {el.columns.map((c, i) => (
        <text
          key={`h${i}`}
          x={el.x + colW * i + 8}
          y={el.y + headerH / 2}
          dominantBaseline="central"
          fontSize={11}
          fontWeight={600}
          fill="var(--color-text-secondary)"
        >
          {c}
        </text>
      ))}
      {el.rows.map((row, ri) =>
        row.slice(0, cols).map((cell, ci) => (
          <text
            key={`r${ri}c${ci}`}
            x={el.x + colW * ci + 8}
            y={el.y + headerH + rowH * ri + rowH / 2}
            dominantBaseline="central"
            fontSize={11}
            fill="var(--color-text-primary)"
          >
            {cell}
          </text>
        )),
      )}
    </g>
  )
}

function ListEl({ el }: { el: Extract<MockupElement, { type: 'list' }> }): JSX.Element {
  const rowH = el.items.length > 0 ? el.h / el.items.length : 0
  return (
    <g>
      {el.items.map((item, i) => {
        const y = el.y + rowH * i + rowH / 2
        const marker = el.ordered ? `${i + 1}.` : '•'
        return (
          <g key={i}>
            <text
              x={el.x + 4}
              y={y}
              dominantBaseline="central"
              fontSize={12}
              fill="var(--color-text-muted)"
            >
              {marker}
            </text>
            <text
              x={el.x + 22}
              y={y}
              dominantBaseline="central"
              fontSize={12}
              fill="var(--color-text-primary)"
            >
              {item}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function TabsEl({ el }: { el: Extract<MockupElement, { type: 'tabs' }> }): JSX.Element {
  const tabW = el.tabs.length > 0 ? el.w / el.tabs.length : 0
  const active = el.activeIdx ?? 0
  return (
    <g>
      {el.tabs.map((label, i) => {
        const x = el.x + tabW * i
        const isActive = i === active
        return (
          <g key={i}>
            <rect
              x={x}
              y={el.y}
              width={tabW}
              height={el.h}
              fill={isActive ? FILL_SURFACE_HOVER : FILL_BG}
              stroke={STROKE}
            />
            <text
              x={x + tabW / 2}
              y={el.y + el.h / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={12}
              fontWeight={isActive ? 600 : 400}
              fill={isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'}
            >
              {label}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function NavEl({ el }: { el: Extract<MockupElement, { type: 'nav' }> }): JSX.Element {
  const isVertical = el.orientation === 'vertical'
  const slot = el.items.length > 0 ? (isVertical ? el.h : el.w) / el.items.length : 0
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.w} height={el.h} fill={FILL_SURFACE} stroke={STROKE} />
      {el.items.map((item, i) => {
        const x = isVertical ? el.x + 12 : el.x + slot * i + slot / 2
        const y = isVertical ? el.y + slot * i + slot / 2 : el.y + el.h / 2
        return (
          <text
            key={i}
            x={x}
            y={y}
            textAnchor={isVertical ? 'start' : 'middle'}
            dominantBaseline="central"
            fontSize={12}
            fontWeight={item.active ? 600 : 400}
            fill={item.active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'}
          >
            {item.label}
          </text>
        )
      })}
    </g>
  )
}

function ModalEl({
  el,
  onJumpSource,
}: {
  el: Extract<MockupElement, { type: 'modal' }>
  onJumpSource?: JumpSource
}): JSX.Element {
  const titleH = el.title ? 28 : 0
  return (
    <g transform={`translate(${el.x} ${el.y})`}>
      <rect x={-12} y={-12} width={el.w + 24} height={el.h + 24} fill="rgba(0,0,0,0.5)" />
      <rect x={0} y={0} width={el.w} height={el.h} fill={FILL_SURFACE} stroke={STROKE} rx={6} />
      {el.title && (
        <>
          <text
            x={12}
            y={titleH / 2 + 2}
            dominantBaseline="central"
            fontSize={13}
            fontWeight={600}
            fill="var(--color-text-primary)"
          >
            {el.title}
          </text>
          <line x1={0} y1={titleH} x2={el.w} y2={titleH} stroke={STROKE} />
        </>
      )}
      {el.children.map((child, i) => (
        <Element key={i} el={child} onJumpSource={onJumpSource} />
      ))}
    </g>
  )
}

function TooltipEl({ el }: { el: Extract<MockupElement, { type: 'tooltip' }> }): JSX.Element {
  const w = Math.max(48, el.text.length * 6.5 + 16)
  const h = 22
  return (
    <g>
      <rect x={el.x} y={el.y} width={w} height={h} rx={4} fill="var(--color-text-primary)" />
      <text
        x={el.x + w / 2}
        y={el.y + h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fill="var(--color-bg)"
      >
        {el.text}
      </text>
    </g>
  )
}
