# 2004: Replace field constraints with Standard Schema

- Status: completed
- Milestone: 20
- Packages: `@ultimabase/core`, `@ultimabase/typegen`, official plugins and examples
- Depends on: 2003
- ADR: decision from issue 2001

## Goal

Accept one synchronous Standard Schema validator as the canonical additional
field-validation contract and delete Core's closed length, range, pattern,
finite, UUID-version, and related constraint DSL.

## Acceptance criteria

- [x] `validation` accepts a structurally valid Standard Schema V1 object or callable for the exact complete canonical non-null field value.
- [x] TypeScript enforces the input and output compatibility rules accepted by the ADR for the canonical field value, including readonly list and object snapshots, without using `any`.
- [x] Core invokes the validator only after canonical field and child snapshots succeed, so scalar, list, object, enum, temporal, pointer, binary, JSON, decimal shape, and plugin-defined values retain their existing structural authority.
- [x] Optional missing and null values bypass the validator while direct `required` retains current non-null semantics.
- [x] Synchronous failures append immutable transport-neutral issues with the complete prefixed Standard Schema path and stable code; malformed results, promise-like results, throws, and transformed outputs fail deterministically.
- [x] Validation remains enforced after caller input, defaults and generators, Hooks input resolution, prepared mutation changes, mutation outcomes, adapter results, and selected result snapshots wherever the existing structural boundary requires it.
- [x] Validators are retained opaquely by identity, are never cloned as plain records, and remain isolated between applications and fields.
- [x] Core adds only the types-only Standard Schema protocol dependency and no concrete validator Runtime dependency.
- [x] Built-in validation interfaces, constraint normalizers, scalar constraint evaluators, obsolete issue codes, barrels, examples, tests, and documentation are removed or replaced in the same change.
- [x] All repository schemas migrate to direct `required`, direct structural metadata, or an explicit Standard Schema validator without a compatibility layer.
- [x] Core schema examples and package documentation explain canonical values, list and object behavior, synchronous validation, issue paths, repeated execution, and the separation from Hooks transformations.

## Tests

- [x] Runtime and type tests cover every built-in family, plugin fields, full list and object values, nested issue paths, null and missing values, defaults, generators, updates, arithmetic outcomes, Hooks replacements, adapter outputs, immutability, and application isolation.
- [x] Negative tests cover malformed protocols and results, async validators, incompatible input/output types, thrown errors, coercion, defaults, stripping, and same-type transformations.
- [x] Removal tests cover source exports, compiled declarations, package archives, deep imports, active examples, and documentation.
- [x] `yarn constraints`, `yarn typecheck`, `yarn test`, `yarn lint`, `yarn format:check`, and `yarn build` pass.

## Verification

- `yarn constraints`
- `yarn typecheck`
- `yarn test` — 338 files and 1,703 tests passed
- `yarn lint` — passed with only centralized baseline warnings
- `yarn format:check`
- `yarn build`
- `yarn test:pack` — 18 files and 90 tests passed
- focused PostgreSQL Runtime suite — 1 file and 8 tests passed through Docker

## Out of scope

- Applying Standard Schema transformations or defaults.
- Async validation, database queries, authorization, or uniqueness checks.
- Replacing field snapshots, Hooks `resolveInput`, or protected constraints.
