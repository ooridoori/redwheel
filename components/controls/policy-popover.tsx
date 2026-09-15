'use client'

/**
 * The decisions, made adjustable.
 *
 * Controls edit a *draft* policy; the plan only changes when Run allocation is
 * pressed. That gives the brief's "single-button engine" a literal button, and
 * it lets a planner line up several changes and see their combined effect
 * rather than watching the plan thrash on every keystroke.
 */
import { LINES, LINE_LABELS, type LineId } from '@/lib/domain'
import { weekLabelLong } from '@/lib/format'
import {
  DEALER_TREATMENT_DESCRIPTIONS,
  DEALER_TREATMENT_LABELS,
  type DealerStockTreatment,
} from '@/lib/engine/dealer-buffer'
import {
  RATIONING_DESCRIPTIONS,
  RATIONING_LABELS,
  type Policy,
  type RationingRule,
} from '@/lib/engine/policy'
import { Popover } from '@/components/ui/popover'
import { PillGroup, cx } from '@/components/ui/primitives'

const RATIONING_OPTIONS = (Object.keys(RATIONING_LABELS) as RationingRule[]).map((rule) => ({
  value: rule,
  label: RATIONING_LABELS[rule],
  title: RATIONING_DESCRIPTIONS[rule],
}))

const DEALER_OPTIONS = (Object.keys(DEALER_TREATMENT_LABELS) as DealerStockTreatment[]).map((treatment) => ({
  value: treatment,
  label: DEALER_TREATMENT_LABELS[treatment],
  title: DEALER_TREATMENT_DESCRIPTIONS[treatment],
}))

export function AssumptionsPopover({
  draft,
  onChange,
  onReset,
  isDirty,
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
          <span className="text-ink-faint">Assumptions</span>
          <span className="text-ink">{RATIONING_LABELS[draft.rationing]}</span>
        </>
      }
      badge={isDirty ? 'dot' : null}
      align="right"
      width={420}
    >
      <div className="flex flex-col gap-4">
        <Field label="Target cover" help="Required weeks of cover. Change a value, then run allocation to see the effect.">
          <div className="flex flex-col gap-1.5">
            {LINES.map((line) => (
              <div key={line} className="flex items-center justify-between gap-3">
                <span className="text-[12.5px] whitespace-nowrap text-ink-muted">{LINE_LABELS[line]}</span>
                <div className="flex items-center gap-1">
                  {draft.targets[line].map((rule, index) => (
                    <Stepper
                      key={rule.from}
                      value={rule.weeks}
                      title={`In force from ${weekLabelLong(rule.from)}`}
                      badge={draft.targets[line].length > 1 ? rule.from.slice(0, 4) : undefined}
                      onStep={(delta) => stepTarget(line, index, delta)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Field>

        <Field label="When a line cannot build everything" help={RATIONING_DESCRIPTIONS[draft.rationing]}>
          <PillGroup
            options={RATIONING_OPTIONS}
            value={draft.rationing}
            onChange={(rationing) => onChange((previous) => ({ ...previous, rationing }))}
          />
        </Field>

        <Field label="Dealer floor stock" help={DEALER_TREATMENT_DESCRIPTIONS[draft.dealerStock]}>
          <PillGroup
            options={DEALER_OPTIONS}
            value={draft.dealerStock}
            onChange={(dealerStock) => onChange((previous) => ({ ...previous, dealerStock }))}
          />
        </Field>

        <button
          type="button"
          onClick={onReset}
          className="self-start text-[11.5px] text-ink-faint underline decoration-dotted underline-offset-2 transition-colors hover:text-ink-muted"
        >
          Reset to the brief&rsquo;s assumptions
        </button>
      </div>
    </Popover>
  )
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-2">{children}</div>
      {help && <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{help}</p>}
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
      {badge && <span className="border-r border-edge px-1.5 text-[10px] text-ink-faint tnum">{badge}</span>}
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
