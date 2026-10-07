# 2603: Execute plugin-owned schema mutations through Runtime

- Status: completed
- Milestone: 26
- Packages: `@ultimabase/core`, `@ultimabase/testing`, database adapters
- Depends on: 2602
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Execute one plugin-defined schema mutation as its own logical operation through
the canonical mutation transaction and persistence-plan pipeline.

## Acceptance criteria

- [x] Direct schema and bound-model commands normalize to one immutable logical
      schema-mutation envelope with an exact target schema and ID.
- [x] Runtime performs structural input validation, visible target loading and
      locking when declared, protected constraint accumulation, handler
      execution, persistence planning, result validation, and materialization in
      ADR-0245 order.
- [x] Every mutation and handler-started database operation uses the root
      automatic transaction; failure or cancellation rolls back all work.
- [x] A handler may return only the definition's accepted owner-only update or
      Master-only delete effect; Core alone compiles the portable persistence
      plan. The handler cannot receive an adapter, authority grant, protected
      constraint, commit method, or another application's engine.
- [x] The logical custom mutation is never replayed as native create, update,
      upsert, or delete behavior merely because its physical plan uses one of
      those statement families.
- [x] Master provenance, callback attribution, safe errors, result selection,
      application isolation, lifecycle disposal, and operation budgets remain
      exact.
- [x] Database capability negotiation rejects unsupported physical plan kinds
      before request effects and PostgreSQL executes the accepted plan with the
      Core-owned protected envelope.
- [x] Testing conformance helpers cover a neutral schema mutation without
      depending on the official Access, Hooks, or soft-delete packages.

## Tests

- [x] Focused Core and PostgreSQL tests cover success, missing or hidden target,
      malformed input/result/plan, rollback, cancellation, constraints, Master,
      two instances, and cross-application rejection.
- [x] Public package and no-Typegen tests execute the same application-owned
      schema and model handles.

## Completion evidence

- Application schema and persisted-model handles normalize the same immutable
  `plugin-schema-mutation` envelope and execute through the active or anonymous
  request engine without Typegen Runtime code.
- The application-lifetime handler capability is owner-attributed, requires the
  exact `persistence:rewrite` privilege and public provider facade, keeps its
  callback private, and exposes only immutable context, payload, target, and
  selected preimage values.
- Runtime locks the protected visible target, validates owner-only replacement
  effects or audited Master-only deletion, preserves the custom logical identity
  through enforcement and behavior, and compiles only Core-owned `update-one`
  or `delete-one` plans inside the root transaction.
- Persistence protocol 2 lets authorized rewriters observe the logical custom
  identity without changing the target, returning contract, effect family,
  protected row filters, or opaque constraints. Adapter support is rejected at
  startup before request effects.
- Focused tests cover schema and model calls, malformed boundaries, missing
  targets, cancellation rollback, protected constraints, Master deletion,
  exact plugin instances, foreign applications, public exports, conformance,
  and PostgreSQL prepared-plan execution.
- `yarn constraints`, `yarn check:issues`, `yarn format:check`,
  `git diff --check`, `yarn typecheck`, `yarn test`, `yarn lint`, and
  `yarn build` passed. The full test suite passed 2,254 tests in 474 files;
  lint reported only line-budget warnings.

## Out of scope

- Product-specific semantics, transport exposure, Access declarations, or Hooks
  callbacks.
