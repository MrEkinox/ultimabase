# 2904: Compose data and behavior plugins

- Status: completed
- Milestone: 29
- Packages: `@ultimabase/create-app`, official data and behavior plugins
- Depends on: 2903
- ADR: decision from issue 2901

## Goal

Make the PostgreSQL, PostgreSQL Vector, Soft Delete, Validation, and Hooks
choices produce truthful, valid generated applications in both languages.

## Acceptance criteria

- [x] PostgreSQL remains the explicit base persistence plugin and cannot be
      accidentally removed from a PostgreSQL project by another choice.
- [x] Each selected optional plugin adds its package, factory, required
      privileges or configuration, and only the example schema behavior that
      the current public contract supports. An empty application stays empty.
- [x] A selected Validation example includes a compatible Standard Schema
      validator and its dependency; Hooks and Soft Delete examples use their
      actual application and schema-local contracts.
- [x] PostgreSQL Vector is selectable but the CLI states that physical vector
      storage is not shipped. It generates no persisted vector field or vector
      search claim in a PostgreSQL starter.
- [x] Generated TS and JS imports use package roots; Typegen tracks optional
      plugin contributions in TS and remains absent in JS.

## Tests

- [x] Packed generated projects cover every plugin alone and representative
      combinations, both languages, plugin configuration diagnostics, and
      startup behavior with a disposable PostgreSQL database.
- [x] Review the affected official plugin guides and Quick Start in the same
      issue, retaining the unpublished initializer warning.

## Completion evidence

- Hooks, Validation, Soft Delete, and PostgreSQL Vector choices now emit exact
  package-root imports, dependencies, and factories. The Task starter attaches
  field input normalization, a compatible Zod validator, and recoverable native
  deletion only when selected. The empty starter adds no schema-local option.
  The vector plugin adds no persisted vector field or search claim.
- Local packed archives supplied eight generated single-plugin projects:
  each plugin alone in TypeScript and JavaScript started successfully against
  disposable PostgreSQL. TypeScript also regenerated declarations and built.
  Packed all-plugin combinations passed Typegen, build, and startup in both
  languages. Removing `hooksPlugin()` while leaving its schema option
  produced the expected unknown-option compiler diagnostic.
- Package Vitest (27 tests), typecheck, ESLint, tsdown with attw/publint,
  repository typecheck/build/constraints/issue checks, website content
  validation and build pass. The generated examples use the current
  public plugin contracts; no Core or plugin package API was changed.
- Documentation impact: public website documentation. Quick Start states
  which plugin choices work in the local, still unpublished initializer.
  The official Hooks, Validation, Soft Delete, and PostgreSQL Vector guides
  were reviewed; their examples and vector-storage limit already match the
  generated behavior. The package README was updated.

## Out of scope

- Implementing vector persistence, a migration plugin, or a generic plugin
  configuration language.
