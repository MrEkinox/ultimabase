# 2704: Filter eager relation inclusions

- Status: completed
- Milestone: 27
- Packages: `@ultimabase/core`, database adapters
- Depends on: 2703
- ADR: [ADR-0247](../../docs/adr/0247-contextual-relation-filters.md)

## Goal

Apply the same relation filter to every eager relation inclusion without
issuing per-parent queries or changing pointer inclusion semantics.

## Acceptance criteria

- [x] Root reads and singular or grouped mutation relationship projections
      resolve the declared filter for each included relation field.
- [x] The relation filter combines with inclusion `where`, ordering, offset,
      limit, selection, nested inclusion, target policy, and protected
      constraints in the ADR's exact order.
- [x] Nested relation inclusions apply each encountered field's own filter and
      share the existing bounded depth, complexity, cancellation, and
      application-isolation rules.
- [x] Grouped collection projections preserve one adapter inclusion plan and do
      not introduce an N+1 query per parent or resolver invocation per item.
- [x] Empty filtered collections remain empty arrays, identifiers remain
      present, and dependency-only or policy-hidden fields do not leak.
- [x] Pointer inclusions retain projection-only semantics and never inherit a
      neighboring relation filter.
- [x] Adapters receive only the canonical prepared inclusion and Query AST; no
      relation callback or request context crosses the database boundary.

## Tests

- [x] Focused Core and adapter-conformance tests cover nested, empty, paginated,
      selected, mutation-result, policy-filtered, and multi-parent inclusions.
- [x] Regression tests prove unchanged pointer projection and bounded query
      counts.

## Completion evidence

- Inclusion preparation now receives the same operation-local relation-filter
  resolver as the root pipeline. Each relation branch runs source traversal and
  target operation policy first, resolves its own declaration once, then sends
  only the combined immutable row filter to the adapter.
- Recursive inclusion preparation reuses that resolver for nested branches and
  grouped mutation projections. A multi-parent collection therefore retains
  one adapter inclusion plan and one resolver invocation per exact field;
  singular mutation projections reuse the already prepared plan.
- Focused Core tests cover nested selection, caller filtering, ordering,
  pagination, empty collections, identifiers, target policy, context, singular
  and grouped mutations, and pointer isolation. A PostgreSQL adapter test proves
  the caller predicate and private row filter compile together inside one eager
  relation branch.
- `yarn typecheck`, `yarn lint`, `yarn build`, `yarn constraints`,
  `yarn check:issues`, `yarn format:check`, and `git diff --check` passed. The
  focused Runtime and PostgreSQL suites passed 55 tests. The official complete
  unit, type, and performance suite passed all 2,350 tests in 501 files.

## Out of scope

- Adding a new eager-loading protocol or adapter-native relation filter API.
