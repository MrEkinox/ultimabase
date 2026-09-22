# 3202: Split oversized Core Runtime modules

- Status: completed
- Milestone: 32
- Packages: `@ultimabase/core`
- Depends on: 3201
- ADR: ADR-0259

## Goal

Split oversized Runtime validation, boundaries, engine and inclusion modules
without changing pipeline order or security semantics.

## Acceptance criteria

- [x] Every touched handwritten production file fits the 600-line hard limit.
- [x] Runtime stages, validation, protected constraints and transaction semantics stay unchanged.
- [x] Baseline entries for files brought under the limit are removed.

## Tests

- [x] Relevant runtime, type and database tests pass.
- [x] Audit confirms no pipeline or API change.

## Handoff

- Documentation impact: internal engineering documentation. The Core package README and public Runtime and data-modeling pages remain accurate because this issue only moves internal code; no public contract changes.
- The audit found two extraction regressions before completion: an empty batch would have opened a transaction, and grouped inclusion projection initially used the application pipeline rather than the transaction pipeline. Both were corrected. A new regression test protects the empty-batch case; the existing grouped-inclusion unit and PostgreSQL E2E tests protect the transactional projection.
- Validation: `yarn typecheck`, `yarn build`, `yarn lint:core`, `yarn test` (527 files, 2537 tests), `yarn test:e2e:built` (98 files, 385 tests), and `yarn check:issues` passed.
- Changed lines: 2,363 added / 2,092 deleted (net +271), including the issue handoff and plan updates.

## Out of scope

- New Runtime extension points or behavior changes.
