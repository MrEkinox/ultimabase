# 3601: Make command contributions native

- Status: completed
- Milestone: 36
- Depends on: none
- ADR: ADR-0272

## Goal

Compile operation and schema-mutation contributions directly into the native
plugin plan and canonical command bindings, removing the four specialized
capability protocols and their duplicated materialization path.

## Acceptance criteria

- [x] One private command plan owns declarations, handler factories, bindings,
      contribution IDs, privileges, and cleanup.
- [x] Operations and schema mutations share registration and binding machinery
      while retaining their distinct execution semantics.
- [x] Remove the approved low-level provider APIs, tokens, wrapper factories,
      provider-only types, planning exceptions, tests, exports, and docs.
- [x] Preserve direct/resource handlers, capability reads, binding-only
      contributions, dormant unselected mutations, deterministic conflicts,
      owner/version checks, reverse cleanup, Typegen, and transports.
- [x] Update source, type, packed-export, documentation, and website coverage.
- [x] Record one documentation-impact classification and commit the issue.

## Result

Command declarations, handler factories, and transport bindings now compile
once into a private native command plan. Core binds static transports before
generic capability factories, materializes resource-backed handlers afterward,
and retains the same owner attribution and reverse cleanup. The four specialized
capability tokens, provider factories, handler wrappers, provider validation
exception, and their duplicate tests are gone.

The canonical authoring surface retains direct handlers, resource handlers,
binding-only contributions, dormant mutations, capability reads, exact
instances, transports, Typegen, and lifecycle cleanup. The current
simplification measurement is 365 fewer production lines, 273 fewer test lines,
three fewer public exports, and 2,173 fewer declaration bytes than the milestone
baseline.

## Validation

- `yarn typecheck`
- `yarn workspace @ultimabase/core test` (258 files, 1,329 tests)
- `yarn lint:core` (no errors; 52 pre-existing line-budget warnings)
- `yarn build`
- focused packed E2E for Core operations and Plugin Kit (4 files, 27 tests)
- `yarn measure:simplification`

## Documentation impact

**Both.** ADR-0272 and the issue record the internal architecture. The Core
README and plugin-author operations guide now describe a contribution as the
single source for declaration, execution, transport bindings, and lifecycle;
they no longer describe the removed provider bridge.
