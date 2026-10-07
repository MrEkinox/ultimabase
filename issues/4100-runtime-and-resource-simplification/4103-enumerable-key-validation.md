# 4103: Centralize enumerable-key validation

- Status: completed
- Milestone: 41
- Packages: `@ultimabase/core`
- Depends on: 4102

## Goal

Remove repeated `Object.keys()` exact-vocabulary loops through a private helper
that deliberately preserves enumerable-string-key semantics.

## Acceptance criteria

- [x] Migrated boundaries keep their exact messages, validation order, and
      historical symbol-key behavior.
- [x] The existing `Reflect.ownKeys()` helper remains distinct.
- [x] Only exact-key loops migrate; semantic iteration remains local.
- [x] Production lines decrease and focused regression tests pass.
- [x] Documentation impact is recorded.

## Outcome

Core now exposes one private `assertExactEnumerableKeys()` helper for legacy
boundaries whose contract is specifically `Object.keys()`: enumerable string
keys only, first unknown key in object order, and historical symbol-key
insensitivity. The existing `assertExactObjectKeys()` continues to use
`Reflect.ownKeys()` and reject symbols where that stricter contract applies.

Thirteen exact-vocabulary loops across application, Runtime, transport,
private-storage, enforcement, and constraint boundaries now share the helper.
Short loops and semantic iterations were deliberately left local when migration
would add code or alter their responsibilities. Handwritten production code
decreases by 3 lines after formatting, including the new helper.

## Validation

- `yarn workspace @ultimabase/core typecheck`
- focused unit suite: 21 files and 121 tests passed
- focused ESLint passed without errors
- focused Prettier passed for every touched file; the repository-wide Core
  check still reports the pre-existing `plugin-command-plan.ts` formatting
  warning
- `git diff --check`

## Documentation impact

Internal engineering documentation. Public validation messages and accepted
inputs remain byte-for-byte compatible, so package and website documentation
does not change.
