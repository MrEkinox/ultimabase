# 745: Add portable relation predicates

- Status: completed
- Milestone: 7+
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Depends on: 742, 744
- ADR: ADR-0052, ADR-0054, ADR-0083, ADR-0118

## Goal

Filter source objects by related target predicates through Core Query rather
than inventing transport-specific relationship operators.

## Acceptance criteria

- [x] Relation fields expose typed `some`, `none`, and `every` predicates over their exact target schema filter capabilities.
- [x] Nested relation predicates normalize deterministically into immutable portable Query AST nodes.
- [x] Predicate builders expose no target terminals, selection, ordering, pagination, or authority options.
- [x] PostgreSQL compiles owning, inverse-pointer, and inverse-relation predicates to parameterized `EXISTS` or equivalent SQL without materializing related rows.
- [x] Target Access filters remain monotonic inside every relation predicate and cannot be removed by source Query hooks.
- [x] Unsupported recursive depth or adapter capability fails explicitly with a typed framework error.

## Tests

- [x] Type, normalization, Access, SQL parameterization, topology, and live PostgreSQL tests cover positive, negative, empty-set, and nested cases.

## Out of scope

- GraphQL filter naming, REST query syntax, and unbounded eager loading.
