# 3203: Split oversized ACL and PostgreSQL modules

- Status: completed
- Milestone: 32
- Packages: `@ultimabase/acl-permissions-plugin`, `@ultimabase/postgres-plugin`
- Depends on: 3202
- ADR: none

## Goal

Split oversized ACL enforcement, prepared mutation and filter compilation
modules along current responsibilities.

## Acceptance criteria

- [x] Every touched handwritten production file fits the 600-line hard limit.
- [x] ACL monotonic policy and parameterized PostgreSQL behavior stay unchanged.
- [x] Baseline entries for files brought under the limit are removed.

## Tests

- [x] Relevant runtime, security and PostgreSQL tests pass.
- [x] Audit confirms no public or storage change.

## Handoff

- Documentation impact: internal engineering documentation. The ACL and PostgreSQL package READMEs and the website's ACL and PostgreSQL sections remain accurate because this issue only moves internal implementation and type contracts; public behavior, SQL parameters, and storage are unchanged.
- Audit: the same ACL input and prepared-update rules, transaction-bound PostgreSQL mutation steps, and parameterized filter visitor remain in place. No package dependency or public export was added. The three former production baseline entries are removed; every touched production file is under 600 lines.
- Validation: `yarn typecheck`, `yarn lint:packages`, `yarn build`, focused ACL/PostgreSQL tests (55), `yarn test` (527 files, 2537 tests), `yarn test:e2e:built` (98 files, 385 tests), and `yarn test:coverage` (602 files, 2782 tests) passed.
- Coverage reference before test-file splits: statements 90.71% (23959/26412), branches 84.14% (14949/17766), functions 95.94% (5020/5232), lines 91.32% (23254/25462).
- Changed lines: 831 added / 744 deleted (net +87), including the issue handoff and plan updates.

## Out of scope

- New authorization or database features.
