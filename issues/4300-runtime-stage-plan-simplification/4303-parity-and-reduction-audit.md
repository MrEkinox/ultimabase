# 4303: Complete parity and reduction audit

- Status: completed
- Milestone: 43
- Packages: repository
- Depends on: 4301, 4302

## Goal

Verify exact Runtime order and report the milestone's production reduction,
test cost, capability parity, and remaining debt.

## Acceptance criteria

- [x] Focused and repository-wide validation pass.
- [x] Additions and removals are classified by production, tests, docs, and config.
- [x] Runtime capability and ordering behavior remain available.
- [x] Further opportunities and rejected abstractions are documented.
- [x] Documentation impact is recorded.

## Delivered changes

- Runtime behavior capability contributions are attributed and projected into
  all eleven optional stage groups during one ordered pass.
- Runtime interceptors are classified into their five global, schema, and
  prepared groups during one ordered pass.
- The former intermediate behavior map, eleven `flatMap` scans, and five
  interceptor `filter` scans are removed.
- A focused regression protects global-before, schema-before, schema-after,
  global-after execution when declaration order is deliberately mixed.
- No public contract, capability, configuration, or Runtime stage was added,
  removed, or renamed.

## Exact diff from `d39fa480`

| Category                             | Added | Removed |  Net |
| ------------------------------------ | ----: | ------: | ---: |
| Handwritten production TypeScript    |    67 |      80 |  -13 |
| Handwritten tests                    |    70 |       0 |  +70 |
| Internal engineering documentation   |   258 |      27 | +231 |
| Configuration or generated artifacts |     0 |       0 |    0 |
| Total                                |   395 |     107 | +288 |

The implementation removes 13 net production lines and fifteen redundant full
list scans. Including the removed behavior materialization map, Runtime stage
planning goes from seventeen traversals to two explicit passes. The added test
is intentionally larger than the production reduction because it makes the
otherwise implicit global/schema ordering contract executable.

## Debt and DX assessment

This is a worthwhile internal simplification, but not a major public DX change:

- maintainers can inspect one behavior collection loop and one interceptor
  classification loop instead of comparing sixteen independent projections;
- adding or removing a retained stage no longer requires choosing another
  `flatMap` or `filter` pattern;
- deterministic ordering is visible directly in the code and protected by a
  mixed-order regression;
- application startup allocates fewer temporary lists, although this is not a
  request-hot-path performance claim;
- plugin authors keep the exact same factories, capabilities, callback inputs,
  ownership, and execution order.

The modest line reduction is honest: explicit typed accumulators take space,
but they are preferable to a shorter dynamic registry that would hide stage
types and make future Runtime work harder to review.

## Rejected reductions

- A generic keyed stage registry was rejected because heterogeneous callback
  signatures would require assertions or type indirection for a small line win.
- Before, after, prepared, guard, effect, and transform executors were not
  merged; their inputs, outputs, replacement semantics, and failure behavior
  are intentionally different.
- The prepared-output validator was not extracted merely to push the remaining
  439-line interceptor file below a warning. Moving a cohesive invariant would
  reduce no debt or production lines.
- Runtime stage order and capability materialization were not changed; either
  would cross the accepted architecture boundary.

## Validation

- `yarn typecheck`
- `yarn test` — 539 files and 2,567 tests pass, with no type errors.
- `yarn lint` — no errors; 49 pre-existing line-budget warnings remain.
- `yarn build` — every package passes build, `attw`, and `publint`.
- `yarn test:e2e:built` — 98 files and 387 tests pass, including PostgreSQL.
- `yarn check:issues` — 9 tests pass.
- Focused behavior and interceptor composition suites pass.
- `yarn prettier --check` on every touched source and issue file.
- `git diff --check`

## Remaining opportunities

The next audit should leave this area unless it finds duplicated semantics, not
just a large file. The strongest repository-wide candidates are the repeated
immutable Runtime envelope construction and the oversized nested-write
normalizer. Both need an equivalence proof first: their shapes correspond to
different security and transaction boundaries, so a superficial generic
builder would be worse than the current explicit code.

## Documentation impact

Internal engineering documentation. Public Runtime behavior and interceptor
contracts remain unchanged, so the package README and public website remain
accurate. The milestone README, issue outcomes, current plan, and this audit
document the internal collection change.
