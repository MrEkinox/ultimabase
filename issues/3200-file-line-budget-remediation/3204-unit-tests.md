# 3204: Split oversized unit and language-service tests

- Status: planned
- Milestone: 32
- Packages: `@ultimabase/core`, `@ultimabase/acl-permissions-plugin`, `@ultimabase/postgres-plugin`, `@ultimabase/typegen`
- Depends on: 3203
- ADR: none

## Goal

Move existing unit and language-service cases into focused suites without
losing assertions, coverage or test isolation.

## Acceptance criteria

- [ ] Every affected handwritten test file fits 700 lines.
- [ ] Existing cases and assertions are preserved, with no coverage exclusion or threshold change.
- [ ] Baseline entries for files brought under the limit are removed.

## Tests

- [ ] Focused suites and relevant type tests pass.
- [ ] Test counts and coverage are compared with the baseline.

## Out of scope

- Rewriting implementation behavior to fit test organization.
