# 3201: Split oversized Core query and schema modules

- Status: completed
- Milestone: 32
- Packages: `@ultimabase/core`
- Depends on: none
- ADR: ADR-0187, ADR-0192, ADR-0259

## Goal

Split the four oversized query modules and `schema/definition.ts` at their
existing internal responsibility boundaries.

## Acceptance criteria

- [x] Every touched handwritten production file fits the 600-line hard limit.
- [x] Public exports, declaration inference, immutable builders, and Runtime behavior stay unchanged.
- [x] Baseline entries for files brought under the limit are removed.
- [x] Core schema examples are reviewed; no behavior changed.

## Tests

- [x] Relevant runtime, type, language-service and package-export tests pass.
- [x] Audit confirms no new dependency cycle or public contract change.

## Handoff

- Documentation impact: internal engineering documentation. The public Core contract, package README, schema examples, and website reading/data-modeling pages remain accurate because this change only moves internal implementation.
- Validation: `yarn typecheck`, `yarn build`, `yarn lint:core`, `yarn test` (526 files / 2,536 tests), `yarn test:e2e:built` (98 files / 385 tests), focused Core query/schema and packed-export tests, and `yarn check:issues` pass. The initial sandboxed `yarn test` run could not bind `127.0.0.1`; its permitted rerun passed.
- Audit: one loop removed an unnecessary relay module, rechecked its focused tests and types, and found no remaining issue. No implementation exceeds the original acceptance criteria; milestone planning files accompany the first issue.
- Commit line delta: +3,258 / -2,804 (net +454); production code is +3,045 / -2,790 (net +255), with the remaining growth from the milestone plan and issue records.

## Out of scope

- New query operators, schema behavior or public APIs.
