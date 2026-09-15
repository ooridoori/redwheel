# Redwheel build planning

Atomic SWE case study. Redwheel is a bicycle manufacturer selling road and
mountain bikes through three channels. This repository consolidates the data
they sent, allocates their constrained build capacity against it, and presents
the resulting plan.

## Running it

```bash
npm install
npm run build:data   # nine CSVs -> data/master.json + data/planning-inputs.json
npm test             # unit tests
npm run dev          # the UI
```

`data/raw/` holds Redwheel's nine files byte-for-byte as received. Everything
downstream is derived, so re-running `build:data` is always safe.

## How it fits together

```
data/raw/*.csv                nine files, three different dialects
      |
      |  lib/normalize/       one adapter per source file
      v
MasterData                    lib/domain.ts — the common schema
      |
      |  lib/planning-inputs.ts
      v
PlanningInputs                compact projection: opening stock, backlog,
      |                       weekly demand, weekly capacity (115 KB)
      |  lib/engine/
      v
BuildPlan                     units to build per line, per week
      |
      v
app/                          the math, and KPIs against target
```

The projection step exists so the engine can run in the browser. `MasterData`
carries all ~14,000 order lines and is 4.7 MB; `PlanningInputs` is 115 KB,
small enough to ship to the client and re-run the engine on every input change.

## The problem in one paragraph

Weeks of supply is inventory divided by weekly demand — how long until you run
out. Redwheel wants 8 weeks of cover on road bikes through 2027 rising to 10 in
2028, 12 on base mountain bikes, and 15 on carbon mountain bikes, all measured
after netting out the units they already owe. Four production lines each have a
weekly ceiling that changes over the horizon, and each line carries either two
or three sizes that compete for it: road-base and mtb-base have M and L,
road-carbon and mtb-carbon have S, M and L. The job is to decide how many of
each SKU to build in each of the 121 weeks from 2026-09-07 to 2028-12-25
without exceeding those ceilings.

## What the plan concludes

All four lines reach their targets inside the horizon, and every one of the
5,931 units owed at the snapshot is delivered by 2026-12-21. Carbon mountain
bikes take until **2027-08-23** to reach 15 weeks of cover — nearly a year —
and that line runs at 78% of capacity to get there.

Two results worth noting. At line level, mtb-base sits at or above target in
**121 of 121 weeks** and looks flawless; one level down, its large size opens
9.3 weeks short while the medium holds 130 weeks of cover and is correctly
built zero times in two years. And the rationing rule changes who waits, not
how much gets built — all three rules build 92,369 units at 75% utilization,
because capacity, not policy, is the binding constraint.

## What the data says, and what we assumed

`npm run build:data` prints a set of data notes, separated into what the files
state and where we exercised judgement. The consequential ones:

- **Dealer-held stock serves dealer demand only.** The 2,000 units on dealer
  floors are neither ignored nor pooled with plant inventory. They absorb
  dealer-channel demand until they run out — 2,000 units Redwheel never has to
  build — but they never count toward Redwheel's own cover, because a bike at
  Summit Cycles cannot fill a DTC order or a commercial PO. Both alternative
  treatments are selectable in the UI: ignoring the file overstates the demand
  reaching the plant, pooling it overstates cover.
- **Targets and capacity are stated per line, but the shortage is not.**
  Redwheel states cover targets by class and trim, and capacity by production
  line, while stock, backlog and forecast are per SKU. The engine therefore
  ranks and allocates at **SKU level**, worst-off first by weeks below target.
  Forecast mix — a SKU's share of its line's demand — is only a tie-breaker;
  as the primary split it would let a size sitting at 10 weeks of cover keep
  taking units while its starving sibling waited.
- **Forecasts run 35 weeks past the capacity horizon.** The plan ends with
  capacity in December 2028, but the extra forecast is needed to measure weeks
  of supply for the final weeks of the plan.
- **`09/08/2025` in the dealer files is month-first.** Confirmed by values such
  as `10/31/2025`, where the first field cannot be a day.
- **Dealer stock counts span six different days**, so that file is a
  self-reported roll-up rather than a synchronized snapshot.
- **Backlog is not reduced by dealer floor stock.** Unfulfilled dealer orders
  are units Redwheel owes; if a dealer could have served them from their own
  floor, they would not still be waiting.

## Opening position

Redwheel-held stock less backlog, at the 2026-09-07 snapshot:

| SKU | Line | On hand | Backlog | Net |
| --- | --- | --- | --- | --- |
| RW-9324 | mtb-base M | 1,900 | 0 | +1,900 |
| RW-9901 | mtb-base L | 60 | 767 | −707 |
| RW-9304 | mtb-carbon S | 10 | 1,435 | −1,425 |
| RW-4418 | mtb-carbon M | 25 | 1,310 | −1,285 |
| RW-6416 | mtb-carbon L | 15 | 767 | −752 |
| RW-3980 | road-carbon S | 90 | 724 | −634 |
| RW-2984 | road-carbon M | 200 | 300 | −100 |
| RW-7298 | road-base L | 250 | 189 | +61 |
| RW-9835 | road-base M | 300 | 291 | +9 |
| RW-1378 | road-carbon L | 150 | 148 | +2 |

Two things stand out. Carbon mountain bikes are 3,462 units underwater against
the deepest target in the brief, on a line that starts at 375 units a week.
And base mountain bikes do not have a volume problem but a mix problem: the
medium holds 1,900 spare units and is the only SKU with no backlog at all,
while its large sibling is 707 short. A medium frame cannot become a large one.
