/**
 * How the 2,000 units sitting in dealer shops affect the plan.
 *
 * Redwheel deliberately sent `dealer_stock_report.csv`, so ignoring it throws
 * away an input they chose to supply. But those units cannot be treated as
 * central inventory either: a bike on the floor at Summit Cycles can serve a
 * customer walking into Summit Cycles, and cannot serve a DTC order or a
 * commercial PO.
 *
 * So dealer stock is modelled as a downstream buffer. It absorbs dealer-channel
 * demand until it runs out, which delays and reduces the demand reaching
 * Redwheel's plant, without ever counting toward Redwheel's own cover.
 *
 * Backlog is deliberately left alone. Unfulfilled dealer orders are units
 * Redwheel owes; if the dealer could have served them from their own floor
 * stock, they would not still be waiting.
 */
import type { PlanningInputs } from '../planning-inputs'

/**
 * - `channel-segregated` (default) — absorbs dealer demand only. Never central stock.
 * - `exclude` — ignore the file entirely. Overstates the demand on the plant.
 * - `central` — pool it with plant stock. Overstates cover, since these units cannot be reallocated.
 */
export type DealerStockTreatment = 'channel-segregated' | 'exclude' | 'central'

export interface DealerAbsorption {
  sku: string
  openingDealerStock: number
  /** Dealer-channel demand met from dealer floor stock rather than by building. */
  unitsAbsorbed: number
  /** First week dealer stock is empty, after which all dealer demand reaches the plant. Null if it never empties. */
  exhaustedWeek: string | null
  /** How many weeks of dealer-channel demand the floor stock covered. */
  weeksCovered: number
}

export interface DemandOnPlant {
  /** What the plant must serve, by SKU, aligned to `forecastWeeks`. */
  net: Record<string, number[]>
  /** Total forecast before the dealer buffer, by SKU, aligned to `forecastWeeks`. */
  gross: Record<string, number[]>
  absorption: DealerAbsorption[]
  totalAbsorbed: number
}

export function demandOnPlant(inputs: PlanningInputs, treatment: DealerStockTreatment): DemandOnPlant {
  const gross: Record<string, number[]> = {}
  const net: Record<string, number[]> = {}
  const absorption: DealerAbsorption[] = []

  for (const product of inputs.products) {
    const total = inputs.demand[product.sku] ?? {}
    const dealerDemand = inputs.demandByChannel.dealer[product.sku] ?? {}

    const grossSeries = inputs.forecastWeeks.map((week) => total[week] ?? 0)
    gross[product.sku] = grossSeries

    if (treatment !== 'channel-segregated') {
      net[product.sku] = grossSeries
      absorption.push({
        sku: product.sku,
        openingDealerStock: inputs.dealerStock[product.sku] ?? 0,
        unitsAbsorbed: 0,
        exhaustedWeek: inputs.forecastWeeks[0] ?? null,
        weeksCovered: 0,
      })
      continue
    }

    let remaining = inputs.dealerStock[product.sku] ?? 0
    const opening = remaining
    let absorbed = 0
    let exhaustedWeek: string | null = remaining === 0 ? (inputs.forecastWeeks[0] ?? null) : null
    let weeksCovered = 0

    const netSeries = inputs.forecastWeeks.map((week, index) => {
      const onDealers = dealerDemand[week] ?? 0
      const fromFloor = Math.min(remaining, onDealers)
      remaining -= fromFloor
      absorbed += fromFloor

      if (fromFloor > 0) {
        weeksCovered += onDealers === 0 ? 0 : fromFloor / onDealers
      }
      if (remaining === 0 && exhaustedWeek === null) {
        exhaustedWeek = inputs.forecastWeeks[index]
      }

      return grossSeries[index] - fromFloor
    })

    net[product.sku] = netSeries
    absorption.push({ sku: product.sku, openingDealerStock: opening, unitsAbsorbed: absorbed, exhaustedWeek, weeksCovered })
  }

  return {
    net,
    gross,
    absorption,
    totalAbsorbed: absorption.reduce((total, entry) => total + entry.unitsAbsorbed, 0),
  }
}

export const DEALER_TREATMENT_LABELS: Record<DealerStockTreatment, string> = {
  'channel-segregated': 'Serves dealer demand only',
  exclude: 'Ignored entirely',
  central: 'Pooled with plant stock',
}

export const DEALER_TREATMENT_DESCRIPTIONS: Record<DealerStockTreatment, string> = {
  'channel-segregated':
    'Dealer-held inventory absorbs dealer-channel demand until depleted, but does not count toward Redwheel\u2019s own cover.',
  exclude:
    'Dealer-held inventory is ignored as supply. Dealer-channel demand still reaches the plant in full.',
  central:
    'Dealer-held inventory is treated as available supply when calculating cover. Dealer-channel demand still reaches the plant.',
}

/** Compact labels for the always-visible scenario summary. */
export const DEALER_SCENARIO_LABELS: Record<DealerStockTreatment, string> = {
  'channel-segregated': 'Dealer stock serves dealer demand',
  exclude: 'Dealer stock ignored',
  central: 'Dealer stock pooled with plant',
}
