# Redwheel Assumptions

## Planning assumptions

- **Planning horizon:** We use the provided ~2-year demand forecast and translate it into weekly production needs.
- **SKU-level targets:** Each SKU has a target weeks-of-cover range. The goal is to keep each SKU adequately supplied against its forecasted demand.
- **Line-level capacity:** SKUs belong to production lines and compete for the same fixed weekly production capacity on that line.
- **Backlog:** Existing unfulfilled customer demand is included as an immediate obligation in addition to forward-looking inventory needs.
- **Dealer inventory:** Dealer stock has already been wholesaled and is therefore considered off Red Wheel's books. It does not reduce Red Wheel's production requirements.
- **Capacity is the constraint:** When a line can satisfy every SKU's requirements, allocation policy doesn't matter. The policy matters when total required production exceeds that week's line capacity.

## Engine model

### Inventory and backlog rollover

Backlog is an outstanding obligation that rolls forward until production clears it. Any inventory left over from the prior week rolls over into the starting inventory for that SKU the following week.

### Required build

For each SKU every week, the engine computes how much ideally needs to be built for the SKU to hit its target cover while satisfying immediate obligations:

```text
Required build = target inventory + obligations - starting available inventory
```

- If the required build is less than or equal to weekly capacity, build what each SKU needs.
- If not, the line is constrained, so the allocation policy determines which SKU receives the scarce capacity first.

## Allocation policy assumptions

- **Worst-off first:** Prioritize the SKU furthest below its target weeks-of-cover.
- **Owed-customers first:** Prioritize the SKU with the largest outstanding backlog.
- **Proportional to needs:** Allocate available line capacity based on each SKU's share of the total required build.
  - **Example:** If SKU A needs 300 units and SKU B needs 100 units, the total required build is 400 units. If the line only has 200 units of capacity:
    - SKU A represents 75% of total need and receives 150 units.
    - SKU B represents 25% of total need and receives 50 units.

