# 4003: Compile declaration privilege access once

- Status: completed
- Milestone: 40
- Packages: `@ultimabase/core`
- Depends on: 4002
- ADR: none

## Goal

Remove repeated manifest privilege lookup and activation checks from the
declaration host while preserving effect-time privilege enforcement.

## Acceptance criteria

- [x] One private owner-local view resolves declaration privilege access.
- [x] Conditional activation, denial, owner attribution, and diagnostics remain
      unchanged.
- [x] Every existing declaration facade remains available only under its exact
      privilege.
- [x] Handwritten production lines decrease and focused tests pass.
- [x] Documentation impact is recorded.

## Outcome

`PluginDeclarationHost` now scans each plugin's normalized privilege requests
once and records the active declaration privileges in one owner-local set. The
field/schema, model, operation, Typegen-reference, and private-storage sessions
read that compiled result instead of each searching the manifest independently.

Conditional capability activation is still evaluated with the same capability
inventory and exact owner. No privilege implication, fallback facade, cached
cross-application state, or public contract was added. The host decreases from
380 to 367 lines; handwritten production TypeScript contains 23 additions and
36 deletions, a net reduction of 13 lines.

An 80-line parity test exercises all five privileges in both states: every
facade is absent when their shared optional declaration capability is inactive,
and every facade is present when it is active.

## Validation

- Five focused declaration, Typegen, private-storage, and model-surface suites
  passed: 18 tests with no type errors.
- The complete Core suite passed: 236 files and 1,089 tests, with no type
  errors.
- `yarn workspace @ultimabase/core typecheck` passed.
- `yarn workspace @ultimabase/core build` passed, including package export
  validation.
- Focused ESLint, `yarn check:issues`, and `git diff --check` passed.

## Documentation impact

Classification: **internal engineering documentation**.

This issue and `CURRENT_PLAN.md` record the private host simplification. Public
permissions, conditional activation, facades, errors, and supported plugin
behavior are unchanged, so package and website documentation remain accurate.
