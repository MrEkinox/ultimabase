# 3204: Split oversized unit and language-service tests

- Status: completed
- Milestone: 32
- Packages: `@ultimabase/core`, `@ultimabase/acl-permissions-plugin`, `@ultimabase/postgres-plugin`, `@ultimabase/typegen`
- Depends on: 3203
- ADR: none

## Goal

Move existing unit and language-service cases into focused suites without
losing assertions, coverage or test isolation.

## Acceptance criteria

- [x] Every affected handwritten test file fits 700 lines.
- [x] Existing cases and assertions are preserved, with no coverage exclusion or threshold change.
- [x] Baseline entries for files brought under the limit are removed.

## Tests

- [x] Focused suites and relevant type tests pass.
- [x] Test counts and coverage are compared with the baseline.

## Handoff

- Documentation impact: internal engineering documentation. Public APIs, examples, and website pages remain unchanged because this issue only reorganizes tests and their fixtures.
- Audit: all ten targeted files are at or below 700 lines; seven obsolete test baseline entries are removed. The split exposed an existing order dependency in ACL tests: row-aware prepared updates assumed another test had compiled the ACL-owned field. The new prepared suite explicitly initializes that field in `beforeAll`, so it passes independently. No assertions, exclusions, or coverage thresholds were removed.
- Validation: `yarn typecheck`, `yarn lint`, `yarn build`, focused suites, `yarn test` (536 files, 2537 tests), and `yarn test:coverage` (611 files, 2782 tests) passed.
- Coverage exactly matches the pre-split reference: statements 90.71% (23959/26412), branches 84.14% (14949/17766), functions 95.94% (5020/5232), lines 91.32% (23254/25462).
- Changed lines: 4,246 added / 3,881 deleted (net +365), including the issue handoff and plan updates.

## Out of scope

- Rewriting implementation behavior to fit test organization.
