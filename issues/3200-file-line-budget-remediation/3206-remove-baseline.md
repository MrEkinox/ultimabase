# 3206: Remove baseline machinery and audit the final budget

- Status: planned
- Milestone: 32
- Packages: repository-wide
- Depends on: 3205
- ADR: none

## Goal

Enforce direct 600/700 hard limits without a per-file exception table.

## Acceptance criteria

- [ ] The baseline table and its special-case rule branches are removed.
- [ ] The rule, tests, ESLint config and `AGENTS.md` consistently state 600/700.
- [ ] Every handwritten TypeScript file fits the applicable hard limit.
- [ ] Advisory warnings remain 400/600 and generated artifacts stay excluded.
- [ ] Final audit finds no public, type, behavior, test or coverage regression.

## Tests

- [ ] `yarn typecheck`, `yarn test`, `yarn lint`, `yarn build`, E2E and coverage pass.
- [ ] Source and packed public exports remain intact.

## Out of scope

- Splitting warning-only files without a maintainability reason.
