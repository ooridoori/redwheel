import Link from 'next/link'
import { loadPlanningInputs } from '@/lib/load-inputs'
import { runAllocation } from '@/lib/engine'
import { weekLabelLong } from '@/lib/format'
import { Assumptions, OpeningPosition, SourceData } from '@/components/data/data-panels'
import { CapacityChart } from '@/components/charts/capacity-chart'

/**
 * Part 1 and the assumptions log, kept off the planner screen.
 *
 * The planner answers what to build; this page answers where the numbers came
 * from and which of them are judgement calls.
 */
export default function DataPage() {
  const inputs = loadPlanningInputs()
  const plan = runAllocation(inputs)

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-edge bg-canvas/95 px-5 py-3 backdrop-blur">
        <h1 className="text-[15px] font-medium tracking-[-0.01em]">Master data &amp; assumptions</h1>
        <span className="text-[11.5px] text-ink-faint tnum">
          snapshot {weekLabelLong(inputs.asOf)}
        </span>
        <Link
          href="/"
          className="ml-auto text-[12.5px] text-ink-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-ink"
        >
          Back to planner
        </Link>
      </header>

      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-5 py-5">
        <p className="max-w-[74ch] text-[13px] leading-relaxed text-ink-muted">
          Nine files arrived in three different dialects. This is what they were turned into, where Redwheel
          stands as a result, and every place a judgement call was made that could reasonably have gone the
          other way.
        </p>

        <SourceData sources={inputs.sources} history={inputs.history} />
        <OpeningPosition plan={plan} dealerStock={inputs.dealerStock} />
        <CapacityChart plan={plan} />
        <Assumptions notes={inputs.notes} />
      </div>
    </div>
  )
}
