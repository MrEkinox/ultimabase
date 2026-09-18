# 2904: Compose data and behavior plugins

- Status: planned
- Milestone: 29
- Packages: `@ultimabase/create-app`, official data and behavior plugins
- Depends on: 2903
- ADR: decision from issue 2901

## Goal

Make the PostgreSQL, PostgreSQL Vector, Soft Delete, Validation, and Hooks
choices produce truthful, valid generated applications in both languages.

## Acceptance criteria

- [ ] PostgreSQL remains the explicit base persistence plugin and cannot be
      accidentally removed from a PostgreSQL project by another choice.
- [ ] Each selected optional plugin adds its package, factory, required
      privileges or configuration, and only the example schema behavior that
      the current public contract supports. An empty application stays empty.
- [ ] A selected Validation example includes a compatible Standard Schema
      validator and its dependency; Hooks and Soft Delete examples use their
      actual application and schema-local contracts.
- [ ] PostgreSQL Vector is selectable but the CLI states that physical vector
      storage is not shipped. It generates no persisted vector field or vector
      search claim in a PostgreSQL starter.
- [ ] Generated TS and JS imports use package roots; Typegen tracks optional
      plugin contributions in TS and remains absent in JS.

## Tests

- [ ] Packed generated projects cover every plugin alone and representative
      combinations, both languages, plugin configuration diagnostics, and
      startup behavior with a disposable PostgreSQL database.
- [ ] Review the affected official plugin guides and Quick Start in the same
      issue, retaining the unpublished initializer warning.

## Out of scope

- Implementing vector persistence, a migration plugin, or a generic plugin
  configuration language.
