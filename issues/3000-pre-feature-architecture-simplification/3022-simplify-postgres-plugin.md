# 3022: Simplify the PostgreSQL plugin

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/postgres-plugin`
- Depends on: 3021
- ADR: retained adapter and PostgreSQL decisions; new ADR only if the stop protocol approves a boundary change

## Goal

Simplify the largest infrastructure plugin while preserving the complete
logical-to-physical persistence contract and database correctness.

## Acceptance criteria

- [ ] Baseline schema, field, query, relation, mutation, transaction,
      introspection, synchronization, constraint, lifecycle, export, and test
      paths against the contract matrix.
- [ ] Identify and remove duplicate compilers, intermediate representations,
      statement builders, validation, mapping, and lifecycle plumbing made
      unnecessary by the simplified Core.
- [ ] Preserve CRUD, bulk, upsert, numeric deltas, nested writes, relations,
      JSONB, virtual dependencies, transactions, locks, protected constraints,
      indexes, schema policies, pools, disposal, and deterministic errors.
- [ ] Keep Drizzle, `pg`, SQL, and database-specific migration behavior confined
      to the PostgreSQL boundary and out of Core and transports.
- [ ] Prefer focused reuse within this package over a new generic Core
      abstraction; any boundary change invokes the architecture stop protocol.
- [ ] Change no public behavior, configuration, export, SQL guarantee, or error
      without explicit user approval.
- [ ] Review the affected PostgreSQL pages under `apps/website/content/docs`
      and, when required, update them and the package README in the same audited
      issue.

## Tests

- [ ] Unit, source and packed types, JavaScript, Testcontainers, constraints,
      transactions, concurrency, nested writes, relations, policies, lifecycle,
      and performance suites pass with unchanged coverage evidence.

## Audit gate

- [ ] Audit query and mutation semantics, atomicity, constraint preservation,
      resource cleanup, SQL ownership, duplicate representations, and measured
      regressions. Correct and repeat until green.
- [ ] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Adding a database feature, migration product, or another adapter.
