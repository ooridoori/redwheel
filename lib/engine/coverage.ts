/**
 * Weeks of supply — the single metric the whole plan is judged against.
 *
 * Stated plainly: how many weeks of upcoming demand does the stock we hold
 * cover? Measured forward against forecast, not backward against sales,
 * because Redwheel gave us three years of forecast and because a plan has to
 * answer for the future it is planning.
 *
 * Weekly demand is uneven, so cover is counted by consuming forecast week by
 * week rather than dividing by an average. Holding 100 units going into two
 * 50-unit weeks is 2 weeks of cover; the same 100 units going into two
 * 100-unit weeks is 1.
 */

/**
 * Units needed on hand at the end of a week to cover the next `weeks` weeks.
 *
 * `forwardDemand` must start with the week *after* the one being measured.
 */
export function targetInventory(forwardDemand: number[], weeks: number): number {
  return forwardDemand.slice(0, weeks).reduce((total, units) => total + units, 0)
}

/**
 * How many weeks of forward demand `netPosition` covers.
 *
 * A negative position — owing more than we hold — returns negative cover,
 * expressed in the same units so "3 weeks short" and "3 weeks of cover" sit on
 * one scale. This is what makes the brief's "5 weeks of backlog against 8 weeks
 * of inventory is 3 weeks of supply" arithmetic work.
 */
export function coverageWeeks(netPosition: number, forwardDemand: number[]): number {
  const average = averageWeeklyDemand(forwardDemand)

  if (netPosition <= 0) {
    return average === 0 ? 0 : netPosition / average
  }

  let remaining = netPosition
  for (const [index, weekDemand] of forwardDemand.entries()) {
    if (weekDemand <= 0) continue
    if (remaining < weekDemand) return index + remaining / weekDemand
    remaining -= weekDemand
  }

  // Cover runs past the end of the forecast; extrapolate at the average rate.
  if (average === 0) return forwardDemand.length
  return forwardDemand.length + remaining / average
}

export function averageWeeklyDemand(forwardDemand: number[]): number {
  if (forwardDemand.length === 0) return 0
  const total = forwardDemand.reduce((sum, units) => sum + units, 0)
  return total / forwardDemand.length
}
