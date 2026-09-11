# 2704: Filter eager relation inclusions

- Status: planned
- Milestone: 27
- Packages: `@ultimabase/core`, database adapters
- Depends on: 2703
- ADR: [ADR-0247](../../docs/adr/0247-contextual-relation-filters.md)

## Goal

Apply the same relation filter to every eager relation inclusion without
issuing per-parent queries or changing pointer inclusion semantics.

## Acceptance criteria

- [ ] Root reads and singular or grouped mutation relationship projections
      resolve the declared filter for each included relation field.
- [ ] The relation filter combines with inclusion `where`, ordering, offset,
      limit, selection, nested inclusion, target policy, and protected
      constraints in the ADR's exact order.
- [ ] Nested relation inclusions apply each encountered field's own filter and
      share the existing bounded depth, complexity, cancellation, and
      application-isolation rules.
- [ ] Grouped collection projections preserve one adapter inclusion plan and do
      not introduce an N+1 query per parent or resolver invocation per item.
- [ ] Empty filtered collections remain empty arrays, identifiers remain
      present, and dependency-only or policy-hidden fields do not leak.
- [ ] Pointer inclusions retain projection-only semantics and never inherit a
      neighboring relation filter.
- [ ] Adapters receive only the canonical prepared inclusion and Query AST; no
      relation callback or request context crosses the database boundary.

## Tests

- [ ] Focused Core and adapter-conformance tests cover nested, empty, paginated,
      selected, mutation-result, policy-filtered, and multi-parent inclusions.
- [ ] Regression tests prove unchanged pointer projection and bounded query
      counts.

## Out of scope

- Adding a new eager-loading protocol or adapter-native relation filter API.
