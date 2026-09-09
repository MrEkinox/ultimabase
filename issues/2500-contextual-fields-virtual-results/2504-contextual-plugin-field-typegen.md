# 2504: Contextualize plugin field declarations and Typegen

- Status: planned
- Milestone: 25
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`, official field and field-option plugins
- Depends on: 2503
- ADR: proposed ADR-0244

## Goal

Let plugin-owned field methods and direct options declare exactly which field
contexts they support so generated autocomplete and application compilation
cannot promise unavailable behavior.

## Acceptance criteria

- [ ] Public plugin declarations use the closed context vocabulary accepted by
      ADR-0244 for stored, embedded, virtual, and output participation.
- [ ] Core validates context claims, privilege ownership, option provenance,
      deterministic materialization, and declared Runtime support before setup
      or infrastructure effects.
- [ ] Typegen emits builder methods and direct options only into their declared
      contextual interfaces and never emits resolver implementation code.
- [ ] Existing official validation, Hooks, Access, ACL, PostgreSQL, and plugin
      field contracts declare truthful contexts without broad defaults.
- [ ] Missing plugins, stale generated declarations, invalid contexts, duplicate
      contributions, unsupported output shapes, and cross-application graphs
      fail deterministically.
- [ ] Plugin Kit helpers reduce repeated declaration boilerplate without
      bypassing Core ownership or validation.
- [ ] Documentation teaches plugin authors how value representation support
      differs from stored-field behavior.

## Tests

- [ ] Two synthetic plugins prove all allowed and forbidden method/option context
      combinations in Core, Typegen, source, built, and packed packages.
- [ ] Official plugin regressions prove there is no new Core dependency on a
      concrete field, policy, validation, transport, or database package.

## Out of scope

- Automatically treating every stored plugin field as a safe output descriptor.
- Adding a new concrete field plugin.
