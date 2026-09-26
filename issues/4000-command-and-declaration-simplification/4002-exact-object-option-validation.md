# 4002: Centralize exact object option validation

- Status: completed
- Milestone: 40
- Packages: `@ultimabase/core`
- Depends on: 4001
- ADR: none

## Goal

Replace repeated plain-object and exact-key loops with one neutral private Core
validator while preserving every caller-owned diagnostic.

## Acceptance criteria

- [x] Existing option boundaries reuse one private implementation.
- [x] Error text, symbol-key handling, and accepted keys remain unchanged.
- [x] No public export or generalized schema/plugin facade is added.
- [x] Handwritten production lines decrease and focused tests pass.
- [x] Documentation impact is recorded.

## Outcome

One 31-line private Core utility now owns plain-object plus exact-own-key
validation. Sixteen production consumers reuse it across plugin definitions,
contributions, permissions, capability resources, schema options and selectors,
private storage, raw adapter providers, output descriptors, constraints, and
compiled provenance.

Each caller still owns its complete diagnostic prefix, accepted-key set, and
plain-object message. The utility retains `Reflect.ownKeys()` behavior, so
symbols are rejected at the same boundaries and the first unexpected own key is
reported as before. Boundaries intentionally based on `Object.keys()` were not
migrated because changing their symbol behavior would be observable.

Handwritten production TypeScript contains 164 additions and 176 deletions, a
net reduction of 12 lines including the new utility. The issue adds a 40-line
test file for message ownership, symbol keys, and plain-object ordering.

## Validation

- Eleven focused option, plugin, capability, private-storage, raw-adapter, and
  privilege suites passed: 79 tests with no type errors.
- The complete Core suite passed: 236 files and 1,088 tests, with no type
  errors.
- The final output, constraint, provenance, and utility checkpoint passed: 3
  files and 38 tests, with no type errors.
- `yarn workspace @ultimabase/core typecheck` passed.
- `yarn workspace @ultimabase/core build` passed, including package export
  validation.
- Focused ESLint passed with only pre-existing line-budget warnings.
- `yarn check:issues` and `git diff --check` passed.

## Documentation impact

Classification: **internal engineering documentation**.

The issue and active plan record the private validation consolidation. Public
configuration, accepted options, errors, and exports are unchanged, so package
and website documentation remain accurate without edits.
