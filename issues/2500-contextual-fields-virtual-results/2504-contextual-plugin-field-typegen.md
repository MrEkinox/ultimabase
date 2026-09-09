# 2504: Contextualize plugin field declarations and Typegen

- Status: completed
- Milestone: 25
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`, official field and field-option plugins
- Depends on: 2503
- ADR: [ADR-0244](../../docs/adr/0244-contextual-fields-and-virtual-results.md)

## Goal

Let plugin-owned field methods and direct options declare exactly which field
contexts they support so generated autocomplete and application compilation
cannot promise unavailable behavior.

## Acceptance criteria

- [x] Public plugin declarations use the closed context vocabulary accepted by
      ADR-0244 for stored, embedded, virtual, and output participation.
- [x] Core validates context claims, privilege ownership, option provenance,
      deterministic materialization, and declared Runtime support before setup
      or infrastructure effects.
- [x] Typegen emits builder methods and direct options only into their declared
      contextual interfaces and never emits resolver implementation code.
- [x] Existing official validation, Hooks, Access, ACL, PostgreSQL, and plugin
      field contracts declare truthful contexts without broad defaults.
- [x] Missing plugins, stale generated declarations, invalid contexts, duplicate
      contributions, unsupported output shapes, and cross-application graphs
      fail deterministically.
- [x] Plugin Kit helpers reduce repeated declaration boilerplate without
      bypassing Core ownership or validation.
- [x] Documentation teaches plugin authors how value representation support
      differs from stored-field behavior.

## Tests

- [x] Two synthetic plugins prove all allowed and forbidden method/option context
      combinations in Core, Typegen, source, built, and packed packages.
- [x] Official plugin regressions prove there is no new Core dependency on a
      concrete field, policy, validation, transport, or database package.

## Completion evidence

- `yarn typecheck`, `yarn format:check`, `yarn constraints`,
  `yarn check:issues`, and `git diff --check` passed.
- `yarn lint` passed with only the repository's existing file-size warnings.
- `yarn build` passed for every workspace, including `attw` and `publint`.
- The full `yarn test` run passed 449 unaffected files and 2,165 tests. The
  three listener-backed files blocked by sandbox `listen EPERM` passed all 15
  tests outside the sandbox; the changed declaration test also passed after
  its compile-only invalid-kind fixture was explicitly marked.
- Focused Core, Plugin Kit, Typegen, generated-declaration, source, compiled,
  and public API tests passed. `yarn test:pack:built` passed 26 files and 150
  tests after regenerating the committed example declarations.

## Out of scope

- Automatically treating every stored plugin field as a safe output descriptor.
- Adding a new concrete field plugin.
