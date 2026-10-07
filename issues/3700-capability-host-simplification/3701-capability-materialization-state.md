# 3701: Consolidate capability materialization state

- Status: completed
- Milestone: 37
- Depends on: none

## Goal

Make Core's existing capability model more direct: index immutable capability
plans once, store each materialized consumer and its provider provenance in one
record, and use one reverse resource-drain implementation for owner and global
cleanup.

## Acceptance criteria

- [x] Exact capability tokens resolve their static plan without rescanning all
      plans during recursive materialization.
- [x] One state record distinguishes unresolved, resolved-with-value, and
      resolved-without-provider capabilities while retaining provenance.
- [x] Owner cleanup and global cleanup share one reverse-order drain without
      changing failure aggregation or plugin attribution.
- [x] Declaration/application lifetimes, factory/setup requirements, cycles,
      cardinality composition, exact instances, privileges, diagnostics, and
      disposal behavior remain unchanged.
- [x] The final production delta is negative, focused and complete Core tests
      pass, and documentation impact is recorded.

## Result

Capability inventory now owns one insertion-ordered token-to-plan index, so
recursive application materialization performs exact lookup without scanning
all plans. The host stores each resolved consumer and its provider provenance in
one record, including an explicit record for an optional capability with no
provider. Owner and global resource cleanup now use one reverse drain that
retains attribution, continuation after failure, and aggregation order.

Production changed by 55 additions and 69 deletions (`-14` lines), all in Core.
`capability-host.ts` moved from 585 to 570 lines. Public exports, generated
declaration bytes, tests, and application-visible behavior are unchanged.

## Validation

- focused capability, graph, factory-context, resource, and lifecycle suite
  (5 files, 42 tests)
- `yarn workspace @ultimabase/core test` (258 files, 1,330 tests)
- `yarn workspace @ultimabase/core typecheck`
- `yarn typecheck`
- `yarn lint` (no errors; 81 existing line-budget warnings)
- `yarn build`
- `yarn check:issues`
- `yarn measure:simplification`

## Documentation impact

**Internal engineering documentation.** This issue and its milestone record the
state and lookup consolidation. Public authoring, configuration, exports,
diagnostics, and behavior are unchanged, so package and website documentation
remain accurate.
