# 2103: Verify exact field-validator invocation

- Status: planned
- Milestone: 21
- Packages: repository-wide
- Depends on: 2102
- ADR: ADR-0221

## Goal

Prove that Standard Schema is one mutation-input validation boundary while
Core's repeatable structural integrity checks remain complete across Runtime,
Typegen, published packages, and PostgreSQL.

## Acceptance criteria

- [ ] A responsibility-based audit finds exactly one production Runtime path
      that invokes a field's Standard Schema validator.
- [ ] Native scalar, list, object, pointer, and plugin-defined fields validate
      once per final mutation occurrence and never during reads or output
      materialization.
- [ ] Defaults, generators, Hooks normalization, prepared-operation transforms,
      value-dependent enforcement, Master authority, and transaction ordering
      match ADR-0221.
- [ ] Integer, bigint, float, and decimal atomic updates validate the projected
      value from the locked target once and retain the adapter's atomic write.
- [ ] Stored values that fail a newly tightened application validator remain
      structurally readable and selectable.
- [ ] Malformed stored values still fail Core structural snapshots and codecs;
      removing result-side application validation creates no untyped adapter
      escape hatch.
- [ ] Zod, Valibot, JavaScript, Typegen-free applications, generated contracts,
      packed declarations, public exports, and application isolation retain the
      canonical developer contract.
- [ ] PostgreSQL Runtime, synchronization, migration, include, and result
      scenarios pass through Testcontainers without replaying validators,
      including a bounded arithmetic update rejected before persistence.
- [ ] Active architecture, package documentation, examples, issues, and the
      milestone archive describe only the single-pass contract.
- [ ] The milestone README records exact commands, test counts, audit evidence,
      and any deliberately deferred work.

## Tests

- [ ] `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`,
      `yarn lint`, `yarn format:check`, and `yarn build` pass.
- [ ] `yarn test:pack` passes against built package archives.
- [ ] `yarn test:e2e:built` passes, including PostgreSQL Testcontainers coverage.

## Out of scope

- Revalidating existing data when an application validator changes.
- Choosing or publishing an official validation library.
- Changing plugin-option Standard Schema semantics from ADR-0211.
