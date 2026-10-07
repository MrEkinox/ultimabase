# 4204: Complete parity and reduction audit

- Status: completed
- Milestone: 42
- Packages: repository
- Depends on: 4201, 4202, 4203

## Goal

Verify the milestone end to end and report its exact source reduction, behavior
parity, DX impact, rejected simplifications, and next safe opportunities.

## Acceptance criteria

- [x] Focused and repository-wide validation pass.
- [x] Exact additions and removals are classified by production, tests, docs, and config.
- [x] Public capability, update, and GraphQL behavior remain available.
- [x] Rejected reductions and remaining opportunities are documented.
- [x] Documentation impact is recorded.

## Delivered changes

- Capability inventory, adapter planning, generic provider planning, and
  Core-owned provider planning share one exact conflict constructor.
- Update application and Runtime field traversal share one normalized
  update-expression envelope reader while retaining distinct operation rules.
- Five GraphQL compiler components share one application-graph lookup for
  required schema surfaces and relationship targets; nested compilers reuse the
  same lookup instance.
- No new helper is exported from a package root, no compatibility layer was
  added, and no public configuration, type, error, or generated schema changed.

## Exact diff from `e0d0b4d1`

| Category                             | Added | Removed |  Net |
| ------------------------------------ | ----: | ------: | ---: |
| Handwritten production TypeScript    |   151 |     201 |  -50 |
| Handwritten tests                    |     7 |       0 |   +7 |
| Internal engineering documentation   |   307 |      23 | +284 |
| Configuration or generated artifacts |     0 |       0 |    0 |
| Total                                |   465 |     224 | +241 |

The implementation itself therefore removes 50 net production lines. The test
increase is one focused assertion protecting the Runtime-specific malformed
update diagnostic. Documentation is larger because this milestone records
three independently reviewable issues, their constraints, and this audit.

## Capability and DX assessment

The result is better, but deliberately incremental:

- A Core maintainer now has one place to preserve the capability-conflict code
  and error envelope instead of four nearly identical throw helpers.
- Query and Runtime no longer risk accepting different normalized update
  envelopes; callers still own their useful contextual messages.
- GraphQL compiler authors use one vocabulary for navigating the compiled
  application graph instead of recreating missing-surface and missing-target
  guards in every compiler.
- Plugin authors and application developers see no migration, renamed option,
  extra abstraction, or reduced capability. The improvement is maintenance DX,
  not a new public facade.

This meets the milestone goal because the canonical mechanics replace existing
duplication directly. It does not merely move the old implementations behind a
large bridge, and every targeted production area becomes smaller.

## Rejected reductions

- Compact scalar field factories were not collapsed behind one inherited
  factory interface. A local proof caused the public TypeScript hover to expand
  from the concrete field type into generic implementation details, so the
  experiment was reverted before this milestone began.
- Relation-predicate collectors were not merged: one traverses nested targets
  while the other deliberately collects only direct predicates at the current
  schema level.
- REST and GraphQL nested-write normalization were not merged because their
  transport validation responsibilities differ.
- Lifecycle cleanup aggregation was not extracted. The duplicated fragments
  are small, while error ordering and ownership are architecture-sensitive and
  the proposed helper did not prove a meaningful net reduction.

## Validation

- `yarn typecheck`
- `yarn test` — 539 files and 2,566 tests pass, with no type errors. The first
  sandboxed run could not open local HTTP listeners; the authorized local run
  passed completely.
- `yarn lint` — no errors; 49 pre-existing line-budget warnings remain.
- `yarn build` — every package passes build, `attw`, and `publint`.
- `yarn test:e2e:built` — 98 files and 387 tests pass, including PostgreSQL.
- `yarn check:issues` — 9 tests pass.
- Focused Core capability, update-expression, Runtime traversal, and GraphQL
  compiler suites pass.
- `git diff --check`

## Remaining opportunities

The next useful audit should prioritize existing line-budget warnings where a
real repeated decision can be removed rather than merely moving code. The best
candidate is Runtime contribution composition: it currently performs several
separate passes over the same ordered interceptor contributions. A safe change
would build the stage groups in one pass while preserving dependency and
registration order. Query relation compilation and lifecycle cleanup should
remain separate until equivalence or a meaningful net reduction is proven.

## Documentation impact

Internal engineering documentation. No public API, configuration, error,
generated schema, or supported integration changed, so the package READMEs and
public website remain accurate. The milestone README, issue outcomes, current
plan, and this audit document the internal consolidation.
