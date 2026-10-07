# 2502: Restrict embedded built-in field declarations

- Status: completed
- Milestone: 25
- Packages: `@ultimabase/core`
- Depends on: 2501
- ADR: [ADR-0244](../../docs/adr/0244-contextual-fields-and-virtual-results.md)

## Goal

Make `EmbeddedFieldBuilder` advertise and accept only built-in behavior Core can
execute for a concrete property of an object field.

## Acceptance criteria

- [x] Every built-in embedded factory has a named context-specific option type
      rather than inheriting the complete stored-root factory signature.
- [x] Autocomplete omits root-only indexes, relationships, dedicated-column
      generators, and every other capability rejected by ADR-0244.
- [x] Requiredness, nullability, lists, defaults, immutability, normalization,
      structural validation, and occurrence-aware behavior remain available
      exactly where the existing Runtime supports them.
- [x] Nested object builders apply the same restrictions recursively without
      losing exact field-map or list inference.
- [x] Untyped JavaScript, stale generated declarations, low-level factories, and
      plugin-patched schemas receive the same precise compilation errors as
      invalid TypeScript declarations.
- [x] A removal audit deletes superseded permissive aliases and updates object
      examples and Core documentation.

## Tests

- [x] Source and compiled language-service tests protect suggestions and rejected
      options for every built-in embedded factory.
- [x] Runtime declaration tests cover every removed capability and every retained
      embedded behavior.

## Completion evidence

- `yarn typecheck` passed.
- `yarn test` passed 445 files and 2,144 tests in the sandbox; its three
  listener-backed files were rerun outside the sandbox and passed 15 tests.
- `yarn lint` passed with only the repository's existing file-size warnings.
- `yarn build` passed for every workspace, including `attw` and `publint`.
- Focused Core Runtime, type, language-service, plugin-patch, packed-package,
  and PostgreSQL schema-compiler suites passed.
- `yarn check:issues`, the active documentation contract suite,
  `yarn format:check`, and `git diff --check` passed.

## Out of scope

- Output-only descriptors, virtual fields, or plugin-owned field declarations.
- Adding an adapter-specific nested JSON-path index contract.
