# Milestone 58: Canonical Query inclusion resolution

- Status: completed
- Issue: 5801

Consolidate the repeated relationship-field and target-schema resolution used
by canonical Query inputs, `QueryBuilder.include()`, and inclusion AST
normalization without changing the public Query contract.

## Execution order

- [x] [5801: Consolidate Query inclusion resolution](5801-consolidate-query-inclusion-resolution.md)

## Outcome

One private resolver now supplies the exact persisted relationship field and
its validated schema target to all three inclusion authoring paths. Production
code is smaller, canonical input normalization falls below the file warning
threshold, and every existing Query capability remains unchanged.
