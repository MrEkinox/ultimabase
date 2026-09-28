# 6203: Specialize plugin-owned schemas without type bridges

- Status: completed
- Milestone: 62
- Packages: `@ultimabase/core`, `@ultimabase/password-auth-plugin`, `@ultimabase/roles-plugin`
- Depends on: 6202
- ADR: ADR-0277

## Goal

Provide one Core-native typed schema specialization boundary for plugins that
add reserved fields, statics, or application capabilities to developer-provided
schema declarations.

## Acceptance criteria

- [x] Password Auth and Roles no longer cast `Schema` or their result through `unknown` to reach specialization behavior.
- [x] One canonical primitive replaces rather than supplements redundant internal definition paths.
- [x] Reserved-field validation, exact class identity, field inference, statics, and capabilities remain unchanged.
- [x] Ordinary `Schema.define()` remains the simplest developer path.
- [x] Source and packed-package autocomplete and hover tests protect the authoring contract.
- [x] Schema examples and public documentation are reviewed and updated where necessary.
- [x] Documentation impact is recorded.

## Tests

- [x] Runtime specialization and reserved-field behavior.
- [x] Compile-time Password User and Role schema inference.
- [x] Complete debt-refactor validation gate.

## Out of scope

- Mutable schema classes.
- Runtime prototype patching.
- A separate plugin-only schema compiler.

## Documentation impact

Both. ADR-0277, `ARCHITECTURE.md`, Core's README, and the schema example index
record the single internal specialization boundary. The plugin-author website
guide and Core schema specialization example document the public replacement;
Password Auth and Roles retain their existing application-facing contracts.

## Outcome

`Schema.defineSpecialized()` now owns static and persisted-result capability
composition. The separate `defineWithStatics()` and `defineWithCapabilities()`
paths were removed without aliases. Password Auth uses a real non-enumerable
private symbol for exact User identity, while Roles receives its exact self
schema directly from Core's typed capability context. Neither factory casts
`Schema` or the resulting class through `unknown` anymore.

The issue changes 22 files with 372 additions and 138 deletions, a net increase
of 234 lines. The production implementation is smaller; the net increase comes
from the accepted ADR, public/internal documentation, the required schema
example, and new source/packed-package editor regressions.

## Validation

- focused specialization and editor contracts: 10 files, 69 tests, no type errors
- `yarn validate:full` with local loopback permission
  - format and typecheck: passed
  - ordinary tests: 547 files, 2,593 tests, no type errors
  - lint: 0 errors; existing line-budget warnings only
  - build: every package passed build, API checks, and package linting
  - complete coverage: 622 files, 2,840 tests, no type errors
  - coverage: 90.91% statements (23,707/26,076), 84.44% branches
    (14,699/17,406), 96.08% functions (5,002/5,206), 91.47% lines
    (22,995/25,138)
  - issue metadata: 1 file, 9 tests
  - public documentation validation: 17 files, 66 tests
