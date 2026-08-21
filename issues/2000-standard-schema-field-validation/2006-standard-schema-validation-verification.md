# 2006: Verify the Standard Schema validation vertical

- Status: completed
- Milestone: 20
- Packages: repository-wide
- Depends on: 2007
- ADR: all accepted milestone 20 decisions

## Goal

Prove that direct field presence, inspectable storage shape, and
validator-neutral application constraints form one complete public and Runtime
validation model.

## Acceptance criteria

- [x] A production-source audit finds no nested `validation.required`, built-in length, range, pattern, finite, UUID-version, decimal precision, or decimal scale validation DSL.
- [x] Core remains the authority for canonical types, missing and null handling, defaults, generators, structured values, relationships, field shape, and validation pipeline placement.
- [x] Standard Schema remains opaque, synchronous, validation-only, vendor-neutral, non-bypassable by master, and unable to silently transform values or influence adapter storage.
- [x] PostgreSQL compiles decimal storage exclusively from direct shape metadata and passes Runtime, synchronization, migration, and Testcontainers coverage.
- [x] Built-in and plugin-defined fields pass source, generated, JavaScript, Typegen-free, packed-package, public E2E, and application-isolation verification with multiple validators.
- [x] Public declarations, archives, manifests, dependency constraints, exports, deep-import guards, active architecture, package READMEs, examples, and contributor guidance expose only the canonical contract.
- [x] Active planning and documentation contain no validation-only derived
      field package or logical field kinds superseded by native fields composed
      with Standard Schema.
- [x] No concrete validator is a production dependency of Core, Typegen, Shared, Plugin Kit, or an official Runtime plugin unless that package independently owns it.
- [x] File-size baselines decrease or disappear wherever deleting the old constraint implementation permits.
- [x] The milestone README records exact commands, focused interoperability and PostgreSQL evidence, and any deliberately deferred work.

## Tests

- [x] `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`, `yarn lint`, `yarn format:check`, and `yarn build` pass.
- [x] `yarn test:pack` passes against built package archives.
- [x] `yarn test:e2e:built` passes, including PostgreSQL Testcontainers coverage.

## Out of scope

- Async business validation or database uniqueness.
- Input coercion, transformation, or a replacement Hooks lifecycle.
- Selecting a validation library for application developers.

## Verification

- Production source, built JavaScript, declarations, and active-documentation
  searches found no superseded field-validation DSL or public symbol.
- Package manifest inspection found Zod and Valibot only in development
  dependencies. Published contracts use the types-only Standard Schema
  protocol where required.
- PostgreSQL reads decimal `precision` and `scale` directly from immutable field
  options and never reads the application validator to select storage.
- `yarn constraints`
- `yarn check:issues` — 1 file and 9 tests passed
- `yarn typecheck`
- `yarn test` — 340 files and 1,711 tests passed
- `yarn lint` — zero errors; only reviewed line-budget warnings remain
- `yarn format:check`
- `yarn build` — every package passed declaration, ATTW, and publint checks
- `yarn test:pack` — 19 files and 93 tests passed
- `yarn test:e2e:built` — 50 files and 195 tests passed, including PostgreSQL
  Testcontainers
- Todo backend workspace typecheck

The first unit invocation overlapped `yarn build`, which temporarily removed
package declarations used by language-service tests. That concurrent result was
discarded; the required sequential rerun against completed artifacts passed.
