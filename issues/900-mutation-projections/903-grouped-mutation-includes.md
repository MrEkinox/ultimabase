# 903: Group collection mutation projections

- Status: done
- Milestone: 9
- Packages: `@ultimabase/core`, `@ultimabase/codegen`
- Depends on: 902
- ADR: [ADR-0180](../../docs/adr/0180-mutation-relationship-projections.md)

## Goal

Allow `createMany` and `updateMany` to share one exact `include` while loading
all persisted results through one grouped relation projection per batch.

## Acceptance criteria

- [x] Both collection commands accept the same generated include contract as singular commands.
- [x] Writes, Access, and hooks remain ordered itemized singular lifecycles.
- [x] Persisted identifiers are collected and projected as one grouped read.
- [x] Returned models are restored to deterministic input order.
- [x] Missing, duplicated, or unknown projected identities fail before commit.
- [x] Empty batches execute no projection query.
- [x] Batches without `include` retain their current execution path.

## Tests

- [x] Runtime tests prove one grouped projection request and stable result ordering.
- [x] Rollback tests prove projection failures abort the complete batch.
- [x] PostgreSQL nested inclusion and query-cardinality coverage is explicitly assigned to issue 904.

## Out of scope

- Set-based public mutation semantics.
- Partial-success batches.
- Delete and upsert commands.
