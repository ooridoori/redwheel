'use client'

/**
 * Scenario configuration: the decisions that change the plan, grouped so a
 * client can see what is being assumed before Run allocation is pressed.
 *
 * Controls edit a *draft* policy; the plan only changes when Run allocation is
 * pressed. That gives the brief's "single-button engine" a literal button, and
 * it lets a planner line up several changes and see their combined effect
 * rather than watching the plan thrash on every keystroke.
 */
import { LINES, LINE_LABELS, type LineId } from '@/lib/domain'
import { targetPeriodLabel } from '@/lib/format'
import {
  RATIONING_DESCRIPTIONS,
  RATIONING_LABELS,
  type Policy,
  type RationingRule,
} from '@/lib/engine/policy'
import { Popover } from '@/components/ui/popover'
import { cx } from '@/components/ui/primitives'

const RATIONING_OPTIONS = (Object.keys(RATIONING_LABELS) as RationingRule[]).map((rule) => ({
  value: rule,
  label: RATIONING_LABELS[rule],
  description: RATIONING_DESCRIPTIONS[rule],
}))

export function AssumptionsPopover({
  draft,
  onChange,
  onReset,
  isDirty,
  horizonYear = '2028',
}: {
  draft: Policy
  /**
   * Takes an updater rather than a value: the steppers fire faster than React
   * re-renders, and a plain value would be computed from a stale draft, so
   * quick repeated clicks would silently collapse into one.
   */
  onChange: (update: (previous: Policy) => Policy) => void
  onReset: () => void
  isDirty: boolean
  /** Last year of the planning horizon; constant mountain rules span through it. */
  horizonYear?: string
}) {
  const stepTarget = (line: LineId, index: number, delta: number) => {
    onChange((previous) => ({
      ...previous,
      targets: {
        ...previous.targets,
        [line]: previous.targets[line].map((rule, position) =>
          position === index
            ? { ...rule, weeks: Math.max(0, Math.min(52, rule.weeks + delta)) }
            : rule,
        ),
      },
    }))
  }

  return (
    <Popover
      label={
        <>
          <span className="text-ink-faint">Scenario</span>
          <span className="text-ink">{RATIONING_LABELS[draft.rationing]}</span>
        </>
      }
      badge={isDirty ? 'dot' : null}
      align="right"
      width={460}
    >
      <div className="flex flex-col gap-5">
        <Field
          label="Target cover"
          help="Required weeks of cover by line. Change a value, then run allocation to see the effect."
        >
          <div className="flex flex-col gap-1.5">
            {LINES.map((line) => (
              <div
                key={line}
                className="grid grid-cols-1 items-center gap-1.5 min-[400px]:grid-cols-[minmax(0,1fr)_auto] min-[400px]:gap-3"
              >
                <span className="text-[12.5px] whitespace-nowrap text-ink-muted">{LINE_LABELS[line]}</span>
                <div className="flex flex-wrap items-center gap-1">
                  {draft.targets[line].map((rule, index) => {
                    const period = targetPeriodLabel(draft.targets[line], index, horizonYear)
                    return (
                      <Stepper
                        key={rule.from}
                        value={rule.weeks}
                        title={`In force ${period}`}
                        badge={period}
                        onStep={(delta) => stepTarget(line, index, delta)}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </Field>

        <Field label="Capacity allocation policy">
          <ChoiceList
            options={RATIONING_OPTIONS}
            value={draft.rationing}
            onChange={(rationing) => onChange((previous) => ({ ...previous, rationing }))}
          />
        </Field>

        <button
          type="button"
          onClick={onReset}
          className="self-start rounded-lg border border-edge bg-raised px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:border-edge-strong hover:text-ink"
        >
          Reset to brief assumptions
        </button>
      </div>
    </Popover>
  )
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      {help && <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{help}</p>}
      <div className="mt-2">{children}</div>
    </div>
  )
}

function ChoiceList<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; description: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cx(
              'rounded-lg border px-3 py-2 text-left transition-colors',
              selected ? 'border-accent/40 bg-accent-soft' : 'border-edge bg-raised hover:border-edge-strong',
            )}
          >
            <div className={cx('text-[12.5px]', selected ? 'text-ink' : 'text-ink-muted')}>{option.label}</div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-faint">{option.description}</p>
          </button>
        )
      })}
    </div>
  )
}

function Stepper({
  value,
  onStep,
  title,
  badge,
}: {
  value: number
  onStep: (delta: number) => void
  title?: string
  badge?: string
}) {
  return (
    <div title={title} className="flex items-center overflow-hidden rounded-md border border-edge bg-raised">
      {badge && (
        <span className="whitespace-nowrap border-r border-edge px-1.5 text-[10px] text-ink-faint tnum">{badge}</span>
      )}
      <button
        type="button"
        onClick={() => onStep(-1)}
        className="px-1.5 py-0.5 text-ink-faint transition-colors hover:bg-hover hover:text-ink"
        aria-label="Decrease target"
      >
        &minus;
      </button>
      <span className={cx('min-w-[30px] text-center text-[12.5px] text-ink tnum')}>{value}w</span>
      <button
        type="button"
        onClick={() => onStep(1)}
        className="px-1.5 py-0.5 text-ink-faint transition-colors hover:bg-hover hover:text-ink"
        aria-label="Increase target"
      >
        +
      </button>
    </div>
  )
}
