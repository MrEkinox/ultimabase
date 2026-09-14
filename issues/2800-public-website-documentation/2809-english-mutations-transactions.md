# 2809: Document mutations and transactions

- Status: planned
- Milestone: 28
- Packages: `apps/website`, `@ultimabase/core`
- Depends on: 2805
- ADR: none

## Goal

Teach the complete public write model from singular operations through nested
writes and automatic transaction behavior.

## Acceptance criteria

- [ ] Pages cover create, update, delete, bulk, unique upsert, immutable model
      commands, selections, and result shapes through current public APIs.
- [ ] Nested pointer and relation commands explain connect, create, update,
      disconnect, set, and clear with their bounded singular-root semantics.
- [ ] Automatic mutation transactions, hook-started work, rollback, explicit
      transactions, before-commit, and post-commit boundaries are explained at
      the developer level.
- [ ] Soft delete clearly distinguishes replace-delete and explicit modes,
      ordinary visibility, native hard delete, and private Master restore and
      purge.
- [ ] Examples retain ordered itemized bulk semantics and do not claim public
      set-based hooks, partial success, nested delete/upsert, or generic hook
      bypasses.
- [ ] Security, Hooks, validation, and persistence-plan links explain where
      related behavior composes without duplicating their full contracts.

## Tests

- [ ] Mutation examples compile and representative commands execute against
      current public exports.
- [ ] Regression searches reject documented removed operations or unsupported
      nested-write and bulk claims.

## Out of scope

- Transport-specific payload reference, migration behavior, planned mutation
  features, or adapter internals.
