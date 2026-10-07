# 2103: Verify exact field-validator invocation

- Status: completed
- Milestone: 21
- Packages: repository-wide
- Depends on: 2102
- ADR: ADR-0221

## Goal

Prove that Standard Schema is one mutation-input validation boundary while
Core's repeatable structural integrity checks remain complete across Runtime,
Typegen, published packages, and PostgreSQL.

## Acceptance criteria

- [x] A responsibility-based audit finds exactly one production Runtime path
      that invokes a field's Standard Schema validator.
- [x] Native scalar, list, object, pointer, and plugin-defined fields validate
      once per final mutation occurrence and never during reads or output
      materialization.
- [x] Defaults, generators, Hooks normalization, prepared-operation transforms,
      value-dependent enforcement, Master authority, and transaction ordering
      match ADR-0221.
- [x] Integer, bigint, float, and decimal atomic updates validate the projected
      value from the locked target once and retain the adapter's atomic write.
- [x] Bulk arithmetic over validated fields proves both exact validation with
      prepared targets and deterministic pre-persistence rejection without
      them; Runtime never validates a delta as a complete value.
- [x] Targetless upsert arithmetic over a validated field is rejected before a
      concurrent conflict can select an unprojected update branch.
- [x] Stored values that fail a newly tightened application validator remain
      structurally readable and selectable.
- [x] Malformed stored values still fail Core structural snapshots and codecs;
      removing result-side application validation creates no untyped adapter
      escape hatch.
- [x] Zod, Valibot, JavaScript, Typegen-free applications, generated contracts,
      packed declarations, public exports, and application isolation retain the
      canonical developer contract.
- [x] PostgreSQL Runtime, synchronization, migration, include, and result
      scenarios pass through Testcontainers without replaying validators,
      including a bounded arithmetic update rejected before persistence.
- [x] Active architecture, package documentation, examples, issues, and the
      milestone archive describe only the single-pass contract.
- [x] The milestone README records exact commands, test counts, audit evidence,
      and any deliberately deferred work.

## Tests

- [x] `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`,
      `yarn lint`, `yarn format:check`, and `yarn build` pass.
- [x] `yarn test:pack` passes against built package archives.
- [x] `yarn test:e2e:built` passes, including PostgreSQL Testcontainers coverage.

## Verification

- The production responsibility audit found one `applicationValidation: true`
  execution and only two complete-value callers: direct canonical values and
  projected arithmetic values. Both are imported exclusively by the mandatory
  `finalMutationValidation` stage; intermediate replacements and results use
  structural snapshots.
- The live PostgreSQL proof observed Hooks-normalized input, defaults, pointers,
  includes, Master, exact projected arithmetic, rejected pre-persistence writes,
  a tightened application rule on an existing row, and malformed stored JSON.
- `corepack yarn constraints`
- `corepack yarn check:issues` — 1 file and 9 tests passed
- `corepack yarn typecheck`
- `corepack yarn test` — 343 files and 1,723 tests passed
- `corepack yarn lint` — zero errors; reviewed line-budget warnings only
- `corepack yarn format:check`
- `corepack yarn build` — every package passed declarations, ATTW, and publint
- `corepack yarn test:pack` — 19 files and 93 tests passed
- `corepack yarn test:e2e:built` — 51 files and 196 tests passed, including
  PostgreSQL Testcontainers
- `corepack yarn workspace @ultimabase/example-todo-backend typecheck`

## Out of scope

- Revalidating existing data when an application validator changes.
- Choosing or publishing an official validation library.
- Changing plugin-option Standard Schema semantics from ADR-0211.
