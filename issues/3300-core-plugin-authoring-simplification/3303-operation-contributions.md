# 3303: Unify application-operation contributions

- Status: completed
- Milestone: 33
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`
- Depends on: 3302
- ADR: ADR-0269

## Goal

Let an operation owner contribute one operation with its handler and optional
transport bindings without manually recreating declaration and capability
providers.

## Acceptance criteria

- [x] One Core contribution correlates the exact operation, handler resource, owner, and optional bindings.
- [x] Core derives internal handler and binding providers with deterministic identities.
- [x] Binding-only contributions remain possible under the operation's exact owner; foreign binding owners remain invalid.
- [x] Explicit application transport selection and all privilege checks remain mandatory.
- [x] Runtime, transaction, public-error, codec, planning, and disposal behavior is unchanged.

## Tests

- [x] Core runtime, type, command-graph, REST, and GraphQL operation tests pass.

## Handoff

- Documentation impact: both. ADR-0269 now states the preserved exact-owner
  rule, the Core and Plugin Kit READMEs teach the Core-native contribution, and
  the website operation guide uses the single `operations` list.
- Direct and resource-backed handlers, deterministic disposal, embedded and
  binding-only transport declarations, missing privileges, public errors,
  transactions, codecs, and explicit application exposure remain covered.
- Validation: root typecheck; Core (260 files, 1,323 tests), Password Auth (15
  files, 64 tests), Plugin Kit (6 files, 23 tests), REST (18 files, 103 tests),
  and GraphQL (21 files, 106 tests) package suites; Core package build checks;
  and website content validation (17 files, 66 tests).
