# 903: Group collection mutation projections

- Status: planned
- Milestone: 9
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Depends on: 902
- ADR: [ADR-0180](../../docs/adr/0180-mutation-relationship-projections.md)

## Goal

Allow `createMany` and `updateMany` to share one exact `include` while loading
all persisted results through one grouped relation projection per batch.

## Acceptance criteria

- [ ] Both collection commands accept the same generated include contract as singular commands.
- [ ] Writes, Access, and hooks remain ordered itemized singular lifecycles.
- [ ] Persisted identifiers are collected and projected as one grouped read.
- [ ] Returned models are restored to deterministic input order.
- [ ] Missing, duplicated, or unknown projected identities fail before commit.
- [ ] Empty batches execute no projection query.
- [ ] Batches without `include` retain their current execution path.

## Tests

- [ ] Runtime tests prove one grouped projection request and stable result ordering.
- [ ] PostgreSQL tests prove nested includes without one root read per item.
- [ ] Rollback tests prove projection failures abort the complete batch.

## Out of scope

- Set-based public mutation semantics.
- Partial-success batches.
- Delete and upsert commands.
