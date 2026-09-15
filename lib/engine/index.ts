/**
 * Part 2: the allocation engine.
 *
 * One pure function walks the plan forward a week at a time, carrying stock and
 * backlog with it. Each week, for each production line:
 *
 *   1. every SKU on the line says how many units it needs to reach its target
 *   2. if the line cannot build that many, the policy decides who gets shorted
 *   3. builds are applied, demand and backlog are shipped, and the leftover
 *      stock becomes next week's opening position
 *
 * Deliberately not an optimizer. A solver would produce a mathematically better
 * plan that no planner could interrogate, and Part 3 exists precisely so a
 * client can interrogate it. Every number below can be traced to one
 * subtraction.
 */
import type { LineId, Product } from '../domain'
import { LINES } from '../domain'
import type { PlanningInputs } from '../planning-inputs'
import { coverageWeeks, targetInventory } from './coverage'
import { demandOnPlant, type DemandOnPlant } from './dealer-buffer'
import { DEFAULT_POLICY, targetWeeksFor, type Policy, type RationingRule } from './policy'

/** One SKU, in one week. The row behind every cell in the plan table. */
export interface PlanRow {
  weekStart: string
  sku: string
  line: LineId
  size: Product['size']
  /**
   * Demand the plant must serve this week: total forecast less whatever dealer
   * floor stock absorbed. This is the number the build decision is made on.
   */
  forecast: number
  /** Total forecast across all three channels, before the dealer buffer. */
  grossForecast: number
  /** Dealer-channel demand met from dealer floor stock instead of by building. */
  absorbedByDealers: number
  startingInventory: number
  startingBacklog: number
  /** Stock less what we owe, at the start of the week. */
  startingNet: number
  /** Weeks of cover we open the week with. Negative means we owe more than we hold. */
  startingCoverage: number
  targetWeeks: number
  /** Units needed at week end to cover the next `targetWeeks` weeks of demand. */
  targetInventory: number
  /** What this SKU asked for. */
  desiredBuild: number
  /** What it got, after the line's capacity was divided up. */
  build: number
  /** Units actually delivered this week, oldest obligations first. */
  shipped: number
  endingInventory: number
  endingBacklog: number
  endingNet: number
  /** Weeks of cover at week end. This is the number judged against target. */
  endingCoverage: number
}

/** A production line, in one week. The group-level view of the same walk. */
export interface LineWeek {
  weekStart: string
  line: LineId
  capacity: number
  /** Total units the line's SKUs asked for. Above capacity means rationing happened. */
  desiredBuild: number
  build: number
  /** Share of the week's capacity used. */
  utilization: number
  /** Units the line could not build this week. */
  unmet: number
  forecast: number
  startingInventory: number
  startingBacklog: number
  /** Cover for the line as a whole at week start, measured against demand from this week on. */
  startingCoverage: number
  targetWeeks: number
  endingInventory: number
  endingBacklog: number
  /** Cover for the line as a whole, from its combined position and demand. */
  endingCoverage: number
  atTarget: boolean
}

export interface LineKpi {
  line: LineId
  /** Target in force in the final week of the plan. */
  targetWeeks: number
  coverageAtStart: number
  coverageAtEnd: number
  /** First week the line reaches its target and stays reachable. Null if it never does. */
  firstWeekAtTarget: string | null
  weeksAtOrAboveTarget: number
  totalBuild: number
  totalCapacity: number
  utilization: number
  backlogAtStart: number
  backlogAtEnd: number
  /** Week the line's backlog reaches zero. Null if it never clears. */
  backlogClearedWeek: string | null
  unmetDemand: number
}

export interface PlanKpis {
  totalBuild: number
  totalCapacity: number
  utilization: number
  backlogAtStart: number
  backlogAtEnd: number
  backlogClearedWeek: string | null
  linesAtTargetAtEnd: number
  lines: LineKpi[]
}

export interface BuildPlan {
  policy: Policy
  weeks: string[]
  rows: PlanRow[]
  lineWeeks: LineWeek[]
  kpis: PlanKpis
  /** What the dealer buffer absorbed, and when it ran dry. */
  dealerBuffer: DemandOnPlant
}

interface Position {
  inventory: number
  backlog: number
}

interface Request {
  product: Product
  forecast: number
  grossForecast: number
  absorbedByDealers: number
  forwardFromThisWeek: number[]
  forwardFromNextWeek: number[]
  position: Position
  startingCoverage: number
  targetInventory: number
  desiredBuild: number
}

export function runAllocation(inputs: PlanningInputs, policy: Policy = DEFAULT_POLICY): BuildPlan {
  const dealerBuffer = demandOnPlant(inputs, policy.dealerStock)
  const series = dealerBuffer.net
  const weekIndex = new Map(inputs.forecastWeeks.map((week, index) => [week, index]))
  const productsByLine = groupByLine(inputs.products)
  const positions = openingPositions(inputs, policy)

  const rows: PlanRow[] = []
  const lineWeeks: LineWeek[] = []

  for (const week of inputs.planWeeks) {
    const index = weekIndex.get(week) ?? 0

    for (const line of LINES) {
      const products = productsByLine[line] ?? []
      if (products.length === 0) continue

      const targetWeeks = targetWeeksFor(policy, line, week)
      const capacity = inputs.capacity[line]?.[week] ?? 0

      const requests: Request[] = products.map((product) => {
        const position = positions[product.sku]
        const forwardFromThisWeek = (series[product.sku] ?? []).slice(index)
        const forwardFromNextWeek = forwardFromThisWeek.slice(1)
        const forecast = forwardFromThisWeek[0] ?? 0
        const grossForecast = (dealerBuffer.gross[product.sku] ?? [])[index] ?? 0
        const needed = targetInventory(forwardFromNextWeek, targetWeeks)

        return {
          product,
          forecast,
          grossForecast,
          absorbedByDealers: grossForecast - forecast,
          forwardFromThisWeek,
          forwardFromNextWeek,
          position,
          startingCoverage: coverageWeeks(position.inventory - position.backlog, forwardFromThisWeek),
          targetInventory: needed,
          // Everything we must cover this week, less what we already hold.
          desiredBuild: Math.max(0, needed + position.backlog + forecast - position.inventory),
        }
      })

      const builds = ration(requests, capacity, policy.rationing, targetWeeks)

      let lineDesired = 0
      let lineBuild = 0
      let lineForecast = 0
      let lineStartingInventory = 0
      let lineStartingBacklog = 0
      let lineEndingInventory = 0
      let lineEndingBacklog = 0
      const lineForwardNext: number[] = []
      const lineForwardNow: number[] = []

      for (const request of requests) {
        const build = builds[request.product.sku] ?? 0
        const { position, forecast } = request

        const startingInventory = position.inventory
        const startingBacklog = position.backlog
        const available = startingInventory + build
        const obligations = startingBacklog + forecast
        const shipped = Math.min(available, obligations)
        const endingInventory = available - shipped
        const endingBacklog = obligations - shipped

        rows.push({
          weekStart: week,
          sku: request.product.sku,
          line,
          size: request.product.size,
          forecast,
          grossForecast: request.grossForecast,
          absorbedByDealers: request.absorbedByDealers,
          startingInventory,
          startingBacklog,
          startingNet: startingInventory - startingBacklog,
          startingCoverage: request.startingCoverage,
          targetWeeks,
          targetInventory: request.targetInventory,
          desiredBuild: request.desiredBuild,
          build,
          shipped,
          endingInventory,
          endingBacklog,
          endingNet: endingInventory - endingBacklog,
          endingCoverage: coverageWeeks(endingInventory - endingBacklog, request.forwardFromNextWeek),
        })

        position.inventory = endingInventory
        position.backlog = endingBacklog

        lineDesired += request.desiredBuild
        lineBuild += build
        lineForecast += forecast
        lineStartingInventory += startingInventory
        lineStartingBacklog += startingBacklog
        lineEndingInventory += endingInventory
        lineEndingBacklog += endingBacklog
        accumulate(lineForwardNext, request.forwardFromNextWeek)
        accumulate(lineForwardNow, request.forwardFromThisWeek)
      }

      const endingCoverage = coverageWeeks(lineEndingInventory - lineEndingBacklog, lineForwardNext)

      lineWeeks.push({
        weekStart: week,
        line,
        capacity,
        desiredBuild: lineDesired,
        build: lineBuild,
        utilization: capacity === 0 ? 0 : lineBuild / capacity,
        unmet: Math.max(0, lineDesired - lineBuild),
        forecast: lineForecast,
        startingInventory: lineStartingInventory,
        startingBacklog: lineStartingBacklog,
        startingCoverage: coverageWeeks(lineStartingInventory - lineStartingBacklog, lineForwardNow),
        targetWeeks,
        endingInventory: lineEndingInventory,
        endingBacklog: lineEndingBacklog,
        endingCoverage,
        atTarget: endingCoverage >= targetWeeks,
      })
    }
  }

  return { policy, weeks: inputs.planWeeks, rows, lineWeeks, kpis: summarize(lineWeeks), dealerBuffer }
}

/**
 * Divides a line's weekly capacity among the SKUs competing for it.
 *
 * Units are whole bikes, so every branch allocates integers and hands any
 * rounding remainder to whoever the rule favours most.
 */
function ration(
  requests: Request[],
  capacity: number,
  rule: RationingRule,
  targetWeeks: number,
): Record<string, number> {
  const builds: Record<string, number> = {}
  for (const request of requests) builds[request.product.sku] = 0

  const totalDesired = requests.reduce((total, request) => total + request.desiredBuild, 0)
  if (totalDesired === 0 || capacity <= 0) return builds

  // The line can satisfy everyone; no rationing needed.
  if (totalDesired <= capacity) {
    for (const request of requests) builds[request.product.sku] = request.desiredBuild
    return builds
  }

  if (rule === 'proportional') {
    let allocated = 0
    const shares = requests.map((request) => {
      const exact = (request.desiredBuild / totalDesired) * capacity
      const whole = Math.floor(exact)
      allocated += whole
      builds[request.product.sku] = whole
      return { sku: request.product.sku, remainder: exact - whole }
    })
    // Whole-unit remainder goes to the largest fractional shares.
    for (const share of shares.sort((a, b) => b.remainder - a.remainder)) {
      if (allocated >= capacity) break
      builds[share.sku] += 1
      allocated += 1
    }
    return builds
  }

  if (rule === 'backlog-first') {
    let remaining = capacity
    // First pass: units already owed to customers, most overdue first.
    const byBacklog = [...requests].sort((a, b) => b.position.backlog - a.position.backlog)
    for (const request of byBacklog) {
      const owed = Math.min(request.desiredBuild, request.position.backlog)
      const grant = Math.min(owed, remaining)
      builds[request.product.sku] += grant
      remaining -= grant
      if (remaining <= 0) return builds
    }
    // Second pass: buffer, worst-off first.
    for (const request of byUrgency(requests, targetWeeks)) {
      const stillWanted = request.desiredBuild - builds[request.product.sku]
      const grant = Math.min(Math.max(0, stillWanted), remaining)
      builds[request.product.sku] += grant
      remaining -= grant
      if (remaining <= 0) break
    }
    return builds
  }

  let remaining = capacity
  for (const request of byUrgency(requests, targetWeeks)) {
    const grant = Math.min(request.desiredBuild, remaining)
    builds[request.product.sku] = grant
    remaining -= grant
    if (remaining <= 0) break
  }
  return builds
}

/**
 * Furthest below target first. Cover and target are both in weeks, so this
 * subtracts like with like.
 *
 * Genuinely equal SKUs are separated by forecast mix — the larger share of the
 * line's demand goes first. That is the only place forecast mix influences
 * allocation; as the primary rule it would undo this ordering entirely.
 */
function byUrgency(requests: Request[], targetWeeks: number): Request[] {
  return [...requests].sort((a, b) => {
    const gap = a.startingCoverage - targetWeeks - (b.startingCoverage - targetWeeks)
    if (Math.abs(gap) > 1e-9) return gap
    return b.forecast - a.forecast
  })
}

function summarize(lineWeeks: LineWeek[]): PlanKpis {
  const lines: LineKpi[] = []

  for (const line of LINES) {
    const weeks = lineWeeks.filter((entry) => entry.line === line)
    if (weeks.length === 0) continue

    const first = weeks[0]
    const last = weeks[weeks.length - 1]
    const atTarget = weeks.find((entry) => entry.atTarget)
    const cleared = weeks.find((entry) => entry.endingBacklog === 0)

    lines.push({
      line,
      targetWeeks: last.targetWeeks,
      coverageAtStart: first.startingCoverage,
      coverageAtEnd: last.endingCoverage,
      firstWeekAtTarget: atTarget?.weekStart ?? null,
      weeksAtOrAboveTarget: weeks.filter((entry) => entry.atTarget).length,
      totalBuild: sum(weeks, (entry) => entry.build),
      totalCapacity: sum(weeks, (entry) => entry.capacity),
      utilization: safeRatio(sum(weeks, (entry) => entry.build), sum(weeks, (entry) => entry.capacity)),
      backlogAtStart: first.startingBacklog,
      backlogAtEnd: last.endingBacklog,
      backlogClearedWeek: cleared?.weekStart ?? null,
      unmetDemand: sum(weeks, (entry) => entry.unmet),
    })
  }

  const totalBuild = sum(lines, (line) => line.totalBuild)
  const totalCapacity = sum(lines, (line) => line.totalCapacity)
  const backlogAtStart = sum(lines, (line) => line.backlogAtStart)
  const backlogAtEnd = sum(lines, (line) => line.backlogAtEnd)

  const weeksInOrder = [...new Set(lineWeeks.map((entry) => entry.weekStart))].sort()
  const backlogClearedWeek =
    weeksInOrder.find((week) =>
      lineWeeks.filter((entry) => entry.weekStart === week).every((entry) => entry.endingBacklog === 0),
    ) ?? null

  return {
    totalBuild,
    totalCapacity,
    utilization: safeRatio(totalBuild, totalCapacity),
    backlogAtStart,
    backlogAtEnd,
    backlogClearedWeek,
    linesAtTargetAtEnd: lines.filter((line) => line.coverageAtEnd >= line.targetWeeks).length,
    lines,
  }
}

/**
 * Opening stock and debt per SKU.
 *
 * Dealer stock is only added here under the `central` treatment, which pools it
 * with plant inventory. Under the default it stays downstream and shows up as
 * reduced demand instead.
 */
function openingPositions(inputs: PlanningInputs, policy: Policy): Record<string, Position> {
  const positions: Record<string, Position> = {}
  for (const product of inputs.products) {
    const pooled = policy.dealerStock === 'central' ? (inputs.dealerStock[product.sku] ?? 0) : 0
    positions[product.sku] = {
      inventory: (inputs.openingStock[product.sku] ?? 0) + pooled,
      backlog: inputs.backlog[product.sku] ?? 0,
    }
  }
  return positions
}

function groupByLine(products: Product[]): Partial<Record<LineId, Product[]>> {
  const grouped: Partial<Record<LineId, Product[]>> = {}
  for (const product of products) {
    ;(grouped[product.line] ??= []).push(product)
  }
  return grouped
}

function accumulate(target: number[], addend: number[]): void {
  for (const [index, value] of addend.entries()) {
    target[index] = (target[index] ?? 0) + value
  }
}

function sum<T>(items: T[], valueOf: (item: T) => number): number {
  return items.reduce((total, item) => total + valueOf(item), 0)
}

function safeRatio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}

export { DEFAULT_POLICY }
export type { Policy, RationingRule }
