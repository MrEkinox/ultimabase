# 2611: Implement the explicit soft-delete mutation

- Status: planned
- Milestone: 26
- Packages: `@ultimabase/soft-delete-plugin`, official Access, Hooks, REST, GraphQL, and Typegen packages
- Depends on: 2604, 2605, 2606, 2607, 2609
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Add one singular logical `softDelete` schema mutation while preserving native
hard delete and exposing the custom operation consistently through every
enabled public surface.

## Acceptance criteria

- [ ] Effective `explicit` schemas expose typed application schema and bound
      model commands targeting one exact persisted ID; disabled and replace-mode
      schemas do not.
- [ ] The mutation has its own logical identity, protected target load, physical
      tombstone update, result contract, public errors, transaction, audit, and
      callback attribution.
- [ ] Native hard delete remains unchanged and can physically remove a visible
      item when its independent delete policy allows it.
- [ ] Official Access exposes `access.softDelete` independently from update and
      delete, and the official Hooks lifecycle exposes
      `beforeOperation.softDelete` and `afterOperation.softDelete` only when
      installed.
- [ ] No Access or Hooks installation is required for structural validation,
      protected visibility, transactionality, or persistence.
- [ ] REST generates `POST /api/v1/classes/{Schema}/{id}/soft-delete` for an
      exposed schema and GraphQL generates `softDelete{Schema}` with the
      accepted ID input and selectable result.
- [ ] Direct, REST, networkless GraphQL, and Yoga requests execute the same
      Core-owned mutation descriptor, handler, constraints, and safe errors.
- [ ] Repeated calls hide the existing tombstone and follow the accepted
      non-disclosing missing-target behavior.

## Tests

- [ ] Type, Typegen, JavaScript, Access, Hooks, REST, GraphQL, Yoga, PostgreSQL,
      rollback, cancellation, Master, relations, and multi-application matrices
      cover explicit mode and retained hard delete.
- [ ] SDL and REST route snapshots reject collisions and prove disabled or
      replace-mode schemas gain no explicit endpoint.

## Out of scope

- `softDeleteMany`, nested soft delete, public restore, or public purge.
