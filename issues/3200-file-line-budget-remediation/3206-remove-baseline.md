# 3206: Remove baseline machinery and audit the final budget

- Status: completed
- Milestone: 32
- Packages: repository-wide
- Depends on: 3205
- ADR: none

## Goal

Enforce direct 600/700 hard limits without a per-file exception table.

## Acceptance criteria

- [x] The baseline table and its special-case rule branches are removed.
- [x] The rule, tests, ESLint config and `AGENTS.md` consistently state 600/700.
- [x] Every handwritten TypeScript file fits the applicable hard limit.
- [x] Advisory warnings remain 400/600 and generated artifacts stay excluded.
- [x] Final audit finds no public, type, behavior, test or coverage regression.

## Tests

- [x] `yarn typecheck`, `yarn test`, `yarn lint`, `yarn build`, E2E and coverage pass.
- [x] Source and packed public exports remain intact.

## Handoff

- Diff: +85/-127 lines.
- Documentation impact: internal engineering documentation. `AGENTS.md` now
  states the direct hard limits and absence of exceptions; the public website
  and package READMEs remain accurate because no product contract changed.
- The first audit found two issues: removing baseline-specific tests reduced
  the unit case count, and website tests still received the production advisory
  warning. The new focused assertions restore the exact test count; advisory
  globs now follow the same test classification as the hard rule. Re-audit is
  clean.
- Independent inventory finds zero oversized handwritten files. The largest
  production file is 600 lines and the largest test file is 700. No line-budget
  disables or baseline export remain.
- `yarn test` passes 2537/2537 cases and E2E passes 385/385. Coverage passes
  2782/2782 with numerators and denominators unchanged in all four metrics.
  Build and E2E include the source and packed-export checks. Typecheck,
  lint, format and issue checks pass. The network-bound unit tests required
  local listener access after an initial sandbox `listen EPERM` rejection.

## Out of scope

- Splitting warning-only files without a maintainability reason.
