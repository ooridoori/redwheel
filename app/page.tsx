import { loadPlanningInputs } from '@/lib/load-inputs'
import { Planner } from '@/components/planner'

export default function Page() {
  return <Planner inputs={loadPlanningInputs()} />
}
