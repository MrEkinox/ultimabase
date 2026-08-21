# 2003: Move decimal shape metadata to direct field options

- Status: completed
- Milestone: 20
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`, `@ultimabase/typegen`
- Depends on: 2002
- ADR: decision from issue 2001

## Goal

Move decimal precision and scale out of application validation so adapters can
inspect storage-relevant shape without reading an opaque Standard Schema.

## Acceptance criteria

- [x] `field.decimal({ precision, scale })` exposes exact documented direct options and preserves the current positive precision, non-negative scale, and `scale <= precision` checks.
- [x] Decimal canonical string snapshots and Runtime precision and scale enforcement read the direct options and remain structural field-shape behavior after the old field-constraint DSL is removed.
- [x] PostgreSQL reads only the direct options when compiling `numeric`, `numeric(p)`, and `numeric(p, s)` and no longer inspects `field.options.validation`.
- [x] Introspection, direct synchronization, migration planning, schema compilation, escaping, and application isolation retain their existing behavior.
- [x] Typegen treats precision and scale as inert field-shape metadata and never confuses them with a generated value constraint.
- [x] A repository audit confirms that no other nested validation key is consumed by an adapter, migration compiler, Typegen shape compiler, or plugin capability; any proven structural consumer receives an explicit ADR decision before implementation continues.
- [x] Nested `validation.precision` and `validation.scale` are removed with no compatibility overload or decoder.

## Tests

- [x] Runtime, type, language-service, Typegen, packed-package, schema-compiler, migration, and PostgreSQL tests cover omitted, precision-only, precision-and-scale, and invalid direct options.
- [x] Source and compiled public declarations expose no nested decimal shape contract.
- [x] `yarn constraints`, `yarn typecheck`, `yarn test`, `yarn lint`, `yarn format:check`, `yarn build`, and focused PostgreSQL tests pass.

## Verification

- `yarn constraints`
- `yarn typecheck`
- `yarn test` — 355 files and 1,869 tests passed
- `yarn lint` — passed with only centralized baseline warnings
- `yarn format:check`
- `yarn build`
- `yarn test:pack:built` — 18 files and 89 tests passed
- `yarn test:e2e:built` — 49 files and 191 tests passed, including PostgreSQL

## Out of scope

- Selecting PostgreSQL as Core's decimal authority.
- Adding database-specific options to Core.
- Replacing the remaining application validation DSL.
