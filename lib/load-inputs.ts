import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PlanningInputs } from './planning-inputs'

/**
 * Reads the compact planning inputs produced by `npm run build:data`.
 *
 * Read from disk at request time rather than imported, so TypeScript infers the
 * declared shape instead of a 115KB literal type — and so regenerating the data
 * does not require a rebuild.
 */
export function loadPlanningInputs(): PlanningInputs {
  const path = join(process.cwd(), 'data', 'planning-inputs.json')
  return JSON.parse(readFileSync(path, 'utf8')) as PlanningInputs
}
