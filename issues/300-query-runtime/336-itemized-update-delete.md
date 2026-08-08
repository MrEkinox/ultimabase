# 336: Add explicit itemized update and delete terminals

- Status: superseded
- Milestone: 3
- Packages: `@ultimabase/core`, database adapters
- Depends on: 334
- ADR: ADR-0069, ADR-0089, ADR-0111

ADR-0164 supersedes this opt-in/set-based split. Generated-schema
`updateMany` and `deleteMany` are now ordered atomic batches of uniquely
targeted singular item operations, with no separate itemized terminal family.

## Goal

Offer an explicit opt-in operation for developers who need per-object update or
delete hooks without weakening the set-based performance contract of
`updateMany` and `deleteMany`.

## Acceptance criteria

- [ ] Public terminal names and result types clearly distinguish itemized work from set-based `updateMany` and `deleteMany`.
- [ ] Matching rows are processed through a bounded, deterministic strategy rather than one unbounded materialization.
- [ ] Each item runs the same field, schema, plugin, transaction, and post-commit lifecycle as its singular mutation.
- [ ] Atomic and non-atomic collection behavior reuses the grouping and stopped-prefix contract from ADR-0111.
- [ ] Ordering, cursor stability, concurrent row changes, and adapter capability requirements are explicit.
- [ ] Existing set-based terminals retain one adapter statement and never opt into item hooks implicitly.
- [ ] Transports can expose the itemized terminals only through an explicit capability decision.

## Tests

- [ ] Runtime tests cover deterministic batching, hook order, rollback, and partial completion.
- [ ] Adapter integration tests prohibit unbounded loading and preserve stable row processing.
- [ ] Compile-time tests distinguish set-based and itemized result contracts.

## Out of scope

- Replacing set-based `updateMany` or `deleteMany`.
- Implicit per-row hooks selected by schema configuration.
