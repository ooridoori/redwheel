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
weekly ceiling that changes over the horizon. The job is to decide how many of
each SKU to build in each of the 121 weeks from 2026-09-07 to 2028-12-25
without exceeding those ceilings.

## What the data says, and what we assumed

`npm run build:data` prints a set of data notes, separated into what the files
state and where we exercised judgement. The consequential ones:

- **Dealer-held stock is excluded from the supply position.** Those 2,000 units
  are already sold into bike shops and cannot be reallocated, so counting them
  would overstate coverage. Reported separately instead.
- **Targets are stated per class and trim, but stock and forecast are per SKU,**
  and so is nothing else. Capacity is also per line. The engine therefore plans
  at line level and splits across sizes by forecast mix.
- **Forecasts run 35 weeks past the capacity horizon.** The plan ends with
  capacity in December 2028, but the extra forecast is needed to measure weeks
  of supply for the final weeks of the plan.
- **`09/08/2025` in the dealer files is month-first.** Confirmed by values such
  as `10/31/2025`, where the first field cannot be a day.
- **Dealer stock counts span six different days**, so that file is a
  self-reported roll-up rather than a synchronized snapshot.

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
