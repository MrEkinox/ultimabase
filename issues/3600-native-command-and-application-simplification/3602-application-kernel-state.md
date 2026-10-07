# 3602: Consolidate application-owned private state

- Status: completed
- Milestone: 36
- Depends on: 3601

## Goal

Replace independent application side tables and bind/read bridges with the
smallest single Core-private application state that materially reduces code
without becoming a public service locator or weakening module boundaries.

## Acceptance criteria

- [x] One Core-private application state owns command publication, materialized
      capability reads, plugin privilege checks, private storage, plugin exports,
      and shared Runtime callback recursion state.
- [x] Remove the independent command, capability, privilege, private-storage,
      plugin-export, and Runtime-callback side tables.
- [x] Preserve framework-less internal Runtime harnesses without weakening real
      application ownership checks.
- [x] Keep the state out of public package exports and plugin capability lookup.
- [x] Preserve application isolation, exact plugin instances, lifecycle, Runtime,
      transports, private storage, and cleanup behavior.

## Result

Six application-keyed side tables and two dedicated bind/read modules were
replaced by one closed `ApplicationKernelState`. Framework construction binds
the state once, schema compilation publishes the command graph once, and Core
domains read only the exact state methods they need. Low-level Runtime harnesses
share only callback-recursion state until a real application state exists.

The issue removes 45 production lines net and one production file. It does not
add a public export, configuration option, or plugin-visible service locator.

## Validation

- `yarn typecheck`
- focused application, command, private-storage, Runtime, and transport tests
  (8 files, 68 tests)
- `yarn workspace @ultimabase/core test` (258 files, 1,329 tests)
- `yarn lint:core` (no errors; 52 pre-existing line-budget warnings)
- `yarn workspace @ultimabase/core build`
- `yarn measure:simplification`

## Documentation impact

**Internal engineering documentation.** The issue and current plan describe the
new private ownership model. Public behavior, configuration, examples, and
exports are unchanged, so no website or package README edit is required.
