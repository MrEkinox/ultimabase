# 745: Add portable relation predicates

- Status: planned
- Milestone: 7+
- Packages: `@ultimabase/core`, `@ultimabase/postgres`
- Depends on: 742, 744
- ADR: ADR-0052, ADR-0054, ADR-0083, ADR-0118

## Goal

Filter source objects by related target predicates through Core Query rather
than inventing transport-specific relationship operators.

## Acceptance criteria

- [ ] Relation fields expose typed `some`, `none`, and `every` predicates over their exact target schema filter capabilities.
- [ ] Nested relation predicates normalize deterministically into immutable portable Query AST nodes.
- [ ] Predicate builders expose no target terminals, selection, ordering, pagination, or authority options.
- [ ] PostgreSQL compiles owning, inverse-pointer, and inverse-relation predicates to parameterized `EXISTS` or equivalent SQL without materializing related rows.
- [ ] Target Access filters remain monotonic inside every relation predicate and cannot be removed by source Query hooks.
- [ ] Unsupported recursive depth or adapter capability fails explicitly with a typed framework error.

## Tests

- [ ] Type, normalization, Access, SQL parameterization, topology, and live PostgreSQL tests cover positive, negative, empty-set, and nested cases.

## Out of scope

- GraphQL filter naming, REST query syntax, and unbounded eager loading.
