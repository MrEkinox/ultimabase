# 3205: Split oversized PostgreSQL and packed E2E tests

- Status: planned
- Milestone: 32
- Packages: `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 3204
- ADR: none

## Goal

Organize live database and packed-export suites under the 700-line limit while
preserving per-worker isolation and current assertions.

## Acceptance criteria

- [ ] Every affected handwritten test file fits 700 lines.
- [ ] Testcontainers and worker-scoped database cleanup remain correct.
- [ ] Case counts and coverage remain at least at baseline; no exclusions or thresholds change.
- [ ] Baseline entries for files brought under the limit are removed.

## Tests

- [ ] Focused E2E and packed package tests pass.
- [ ] Audit confirms no accidental cross-file parallelism or resource leak.

## Out of scope

- Database behavior changes.
