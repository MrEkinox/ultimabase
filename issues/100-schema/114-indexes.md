# 114: Add schema indexes

- Status: done
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 110
- ADR: ADR-0014

## Goal

Represent normalized single-field, composite, and unique indexes without storage-specific metadata.

## Acceptance criteria

- [x] Composite index field names are schema-checked.
- [x] Field-level and schema-level index declarations share one normalized output.
- [x] Composite indexes contain at least two distinct fields.
- [x] No SQL appears in the contract.

## Tests

- [x] Regular, unique, system-field, and invalid composite indexes are covered.
