# 331: Add find and output hooks

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 306, 315, 326, 330, 337
- ADR: ADR-0058, ADR-0089, ADR-0090

## Goal

Provide Parse-inspired `beforeFind` and `afterFind` behavior plus safe typed
field output resolution for every read transport.

## Acceptance criteria

- [ ] One `beforeFind` declaration covers `find`, `first`, `get`, `count`, and `exists` with an exact terminal discriminant.
- [ ] `beforeFind` returns a new immutable query or leaves it unchanged without mutating the original `Query`.
- [ ] One `afterFind` declaration observes or replaces the operation-specific result with the same inferred result type.
- [ ] Generic adapter constraints cannot be removed by a query transform and final output cannot restore fields removed by a monotonic restriction.
- [ ] Inline field `resolveOutput` runs only for selected readable values and preserves the field's logical type.
- [ ] Read hooks do not open an automatic transaction; an existing explicit transaction is preserved.
- [ ] Count and exists results retain number and boolean types rather than being coerced into object collections.
- [ ] REST, GraphQL, and direct Query execution will share this Runtime behavior without transport-owned hook paths.

## Tests

- [ ] Runtime tests cover every read terminal, transformed filters, projections, generic adapter constraints, null, and empty results.
- [ ] Compile-time tests cover terminal result narrowing and field output values.
- [ ] Immutability tests prove original Query and adapter results are not mutated.

## Out of scope

- Transport-specific response hooks.
- Changing a field's logical output type.
