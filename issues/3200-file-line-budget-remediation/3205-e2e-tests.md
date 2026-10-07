# 3205: Split oversized PostgreSQL and packed E2E tests

- Status: completed
- Milestone: 32
- Packages: `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 3204
- ADR: none

## Goal

Organize live database and packed-export suites under the 700-line limit while
preserving per-worker isolation and current assertions.

## Acceptance criteria

- [x] Every affected handwritten test file fits 700 lines.
- [x] Testcontainers and worker-scoped database cleanup remain correct.
- [x] Case counts and coverage remain at least at baseline; no exclusions or thresholds change.
- [x] Baseline entries for files brought under the limit are removed.

## Tests

- [x] Focused E2E and packed package tests pass.
- [x] Audit confirms no accidental cross-file parallelism or resource leak.

## Handoff

- Diff: +1693/-1530 lines.
- Documentation impact: internal engineering documentation. Only test organization
  and this issue record changed; public behavior, package contracts, README
  guidance, and website pages remain accurate.
- The audit found that packed declaration-hover tests read their fixture from
  the original E2E file. Their source lookup now includes the extracted fixture
  modules, and the focused hover suite passes again.
- The four focused E2E files pass 27/27 cases; the complete E2E suite passes
  385/385. Coverage passes 2782/2782 cases and exactly matches the prior
  statements, branches, functions, and lines numerators and denominators.
- Test registration stays in the original files, retaining the worker boundary
  and lifecycle hooks. The moved runtime and relation cases retain all 15 names.

## Out of scope

- Database behavior changes.
