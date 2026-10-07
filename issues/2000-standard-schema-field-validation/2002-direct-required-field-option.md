# 2002: Move required presence to a direct field option

- Status: completed
- Milestone: 20
- Packages: `@ultimabase/core`, `@ultimabase/typegen`, official plugins
- Depends on: 2001
- ADR: decision from issue 2001

## Goal

Replace `validation: { required: true }` with the direct `required: true` field
option across built-in, embedded, pointer, and plugin-defined field authoring.

## Acceptance criteria

- [x] Every field shape that currently supports required presence exposes a documented direct `required?: boolean` option with exact literal inference and autocomplete.
- [x] Validation plans, create inputs, update inputs, defaulted and generated fields, derived nullability, object children, lists, pointers, plugin fields, and model results preserve their current presence semantics.
- [x] Relationship-only declarations continue to reject unsupported presence metadata rather than inheriting it accidentally.
- [x] Field factories normalize and retain `required` as immutable inspectable metadata without nesting it inside an opaque validator.
- [x] Typegen reads the direct option and emits identical required and optional application contracts without becoming Runtime truth.
- [x] `validation.required`, `FieldValidationOptions.required`, nested presence normalizers, examples, documentation, and superseded tests are removed in the same change.
- [x] Unknown-key and diagnostic targeting identify `required` directly, with no compatibility alias or migration decoder.
- [x] Built-in and community plugin field authoring retain precise source and compiled editor behavior.

## Tests

- [x] Runtime, type, language-service, Typegen, JavaScript, Typegen-free, packed-package, plugin-field, object, list, pointer, default, generator, and application-isolation tests cover direct presence.
- [x] A removal audit proves active production sources, exports, declarations, examples, and documentation contain no nested `validation.required` contract.
- [x] `yarn constraints`, `yarn typecheck`, `yarn test`, `yarn lint`, `yarn format:check`, and `yarn build` pass.

## Evidence

- Core, official plugins, examples, Typegen fixtures, JavaScript fixtures, and
  packed declarations use direct `required`; the remaining active nested
  occurrences are explicit rejection regression tests.
- `corepack yarn constraints`, `corepack yarn typecheck`, `corepack yarn lint`,
  `corepack yarn format:check`, and `corepack yarn build` pass.
- `corepack yarn test` passes 353 files and 1,863 tests.
- `corepack yarn test:pack` covers the packed public declarations, JavaScript,
  Typegen-free, and generated editor contracts.
- `corepack yarn test:e2e:built` passes 49 files and 190 tests, including the
  PostgreSQL/Docker vertical.

## Out of scope

- Replacing length, range, pattern, finite, UUID-version, or other value constraints.
- Moving decimal precision or scale.
- Adding Standard Schema Runtime execution.
