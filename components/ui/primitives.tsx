/**
 * The handful of shapes the whole interface is built from.
 *
 * Hand-rolled rather than pulled from a component library: the surface area is
 * small, and every one of these needs to be explainable line by line.
 */
import type { ReactNode } from 'react'

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ')
}

/** A set of pills where exactly one is selected. */
export function PillGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; title?: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-edge bg-raised p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cx(
            'rounded-lg px-2.5 py-1 text-[12px] transition-colors',
            option.value === value ? 'bg-accent-soft text-ink' : 'text-ink-muted hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <section className={cx('rounded-xl border border-edge bg-surface', padded && 'p-5', className)}>
      {children}
    </section>
  )
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <header className="mb-4 flex items-baseline justify-between gap-4">
      <h2 className="text-[15px] font-medium text-ink">{children}</h2>
      {hint && <span className="text-[11.5px] text-ink-faint tnum">{hint}</span>}
    </header>
  )
}

export type Tone = 'neutral' | 'positive' | 'negative' | 'warning' | 'accent'

const TONE_STYLES: Record<Tone, string> = {
  neutral: 'border-edge-strong/60 bg-hover text-ink-muted',
  positive: 'border-pos/30 bg-pos-soft text-pos',
  negative: 'border-neg/30 bg-neg-soft text-neg',
  warning: 'border-warn/30 bg-warn-soft text-warn',
  accent: 'border-accent/40 bg-accent-soft text-accent-bright',
}

export function Badge({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode
  tone?: Tone
  title?: string
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium tnum',
        TONE_STYLES[tone],
      )}
    >
      {children}
    </span>
  )
}

/** A thin horizontal meter, used for capacity utilisation. */
export function Meter({ value, tone = 'accent' }: { value: number; tone?: Tone }) {
  const fill =
    tone === 'negative'
      ? 'bg-neg'
      : tone === 'warning'
        ? 'bg-warn'
        : tone === 'positive'
          ? 'bg-pos'
          : 'bg-accent'

  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-hover">
      <div
        className={cx('h-full rounded-full', fill)}
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  )
}

export function Divider() {
  return <div className="h-px w-full bg-edge" />
}

/** A pulsing placeholder, sized by the caller so it sits where a real figure will. */
export function Bone({ className }: { className?: string }) {
  return <div className={cx('bone', className)} />
}
