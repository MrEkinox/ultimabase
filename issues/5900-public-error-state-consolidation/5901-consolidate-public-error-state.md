# 5901: Consolidate public error state

- Status: completed
- Milestone: 59
- Package: `@ultimabase/core`
- Depends on: none
- ADR: ADR-0042

## Goal

Make one private Core implementation own the immutable metadata validation,
snapshotting, initialization, and safe serialization shared by
`FrameworkError` and `PluginError`.

## Acceptance criteria

- [x] Both public classes retain their exact constructors, names, code rules,
      public properties, `Error` inheritance, and distinct `instanceof`
      behavior.
- [x] Option validation order, messages, immutable detail snapshots, native
      causes, retryability, and public JSON payloads remain unchanged.
- [x] No internal helper is exported from `@ultimabase/core`.
- [x] Production TypeScript removes more lines than it adds.
- [x] Focused and repository-wide validation pass.
- [x] Documentation impact is recorded.

## Tests

- [x] Existing framework-error and plugin-error tests pass.
- [x] Regression coverage proves both classes retain the shared validation,
      immutability, serialization, and identity guarantees.

## Out of scope

- Changing framework or plugin error codes.
- Changing transport mappings or operation error declarations.
- Exposing a new public error base class or authoring helper.
- Consolidating operation cancellation behavior.

## Documentation impact

Internal engineering documentation. The Core README, website, and ADR-0042
remain accurate because constructors, exports, code vocabularies, validation,
public payloads, diagnostic isolation, and transport behavior do not change.
This issue and the active plan record the private consolidation.

## Outcome

The private `PublicError` base now owns option validation, native cause
construction, immutable detail snapshots, common properties, freezing, and
safe JSON serialization. `FrameworkError` and `PluginError` retain separate
public classes and code validators, exact named option and payload interfaces,
distinct `instanceof` identities, and their existing root exports. The base is
not exported by `@ultimabase/core`.

Production TypeScript adds 124 lines and removes 144, a net reduction of 20.
Tests add 34 lines and remove 3 to cover plugin detail snapshots and the two
classes' distinct native identities.

## Validation

- focused error validation: 2 files, 8 tests, no type errors
- `yarn workspace @ultimabase/core test`: 266 files, 1,356 tests
- `yarn workspace @ultimabase/core typecheck`
- `yarn workspace @ultimabase/core build`
- `yarn constraints`
- `yarn check:issues`
- `yarn typecheck`
- `yarn test`: 545 files, 2,584 tests, no type errors
- `yarn lint`: 0 errors; 48 pre-existing Core file-budget warnings reported
- `yarn build`: every package passed build, API checks, and package linting
- `yarn test:coverage`: 620 files, 2,831 tests, no type errors
- coverage: 90.92% statements, 84.44% branches, 96.07% functions, 91.48% lines

The first sandboxed `yarn test` attempt could not open local listener ports and
reported `listen EPERM`; its authorized local-network rerun passed completely.
