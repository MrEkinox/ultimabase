# 2603: Execute plugin-owned schema mutations through Runtime

- Status: planned
- Milestone: 26
- Packages: `@ultimabase/core`, `@ultimabase/testing`, database adapters
- Depends on: 2602
- ADR: ADR-0245, once accepted

## Goal

Execute one plugin-defined schema mutation as its own logical operation through
the canonical mutation transaction and persistence-plan pipeline.

## Acceptance criteria

- [ ] Direct schema and bound-model commands normalize to one immutable logical
      schema-mutation envelope with an exact target schema and ID.
- [ ] Runtime performs structural input validation, visible target loading and
      locking when declared, protected constraint accumulation, handler
      execution, persistence planning, result validation, and materialization in
      ADR-0245 order.
- [ ] Every mutation and handler-started database operation uses the root
      automatic transaction; failure or cancellation rolls back all work.
- [ ] A handler may select only an accepted portable persistence plan and cannot
      receive an adapter, authority grant, protected constraint, commit method,
      or another application's engine.
- [ ] The logical custom mutation is never replayed as native create, update,
      upsert, or delete behavior merely because its physical plan uses one of
      those statement families.
- [ ] Master provenance, callback attribution, safe errors, result selection,
      application isolation, lifecycle disposal, and operation budgets remain
      exact.
- [ ] Database capability negotiation rejects unsupported physical plan kinds
      before request effects and PostgreSQL executes the accepted plan with the
      Core-owned protected envelope.
- [ ] Testing conformance helpers cover a neutral schema mutation without
      depending on the official Access, Hooks, or soft-delete packages.

## Tests

- [ ] Focused Core and PostgreSQL tests cover success, missing or hidden target,
      malformed input/result/plan, rollback, cancellation, constraints, Master,
      two instances, and cross-application rejection.
- [ ] Public package and no-Typegen tests execute the same application-owned
      schema and model handles.

## Out of scope

- Product-specific semantics, transport exposure, Access declarations, or Hooks
  callbacks.
