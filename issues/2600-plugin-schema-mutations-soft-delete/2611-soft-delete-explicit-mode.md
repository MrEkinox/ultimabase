# 2611: Implement the explicit soft-delete mutation

- Status: completed
- Milestone: 26
- Packages: `@ultimabase/soft-delete-plugin`, official Access, Hooks, REST, GraphQL, and Typegen packages
- Depends on: 2604, 2605, 2606, 2607, 2609
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Add one singular logical `softDelete` schema mutation while preserving native
hard delete and exposing the custom operation consistently through every
enabled public surface.

## Acceptance criteria

- [x] Effective `explicit` schemas expose typed application schema and bound
      model commands targeting one exact persisted ID; disabled and replace-mode
      schemas do not.
- [x] The mutation has its own logical identity, protected target load, physical
      tombstone update, result contract, public errors, transaction, audit, and
      callback attribution.
- [x] Native hard delete remains unchanged and can physically remove a visible
      item when its independent delete policy allows it.
- [x] Official Access exposes `access.softDelete` independently from update and
      delete, and the official Hooks lifecycle exposes
      `beforeOperation.softDelete` and `afterOperation.softDelete` only when
      installed.
- [x] No Access or Hooks installation is required for structural validation,
      protected visibility, transactionality, or persistence.
- [x] REST generates `POST /api/v1/classes/{Schema}/{id}/soft-delete` for an
      exposed schema and GraphQL generates `softDelete{Schema}` with the
      accepted ID input and selectable result.
- [x] Direct, REST, networkless GraphQL, and Yoga requests execute the same
      Core-owned mutation descriptor, handler, constraints, and safe errors.
- [x] Repeated calls hide the existing tombstone and follow the accepted
      non-disclosing missing-target behavior.

## Tests

- [x] Type, Typegen, JavaScript, Access, Hooks, REST, GraphQL, Yoga, PostgreSQL,
      rollback, cancellation, Master, relations, and multi-application matrices
      cover explicit mode and retained hard delete.
- [x] SDL and REST route snapshots reject collisions and prove disabled or
      replace-mode schemas gain no explicit endpoint.

## Out of scope

- `softDeleteMany`, nested soft delete, public restore, or public purge.

## Completion evidence

- The official plugin declares `ultimabase.soft-delete.soft-delete` once and
  selects only effective `explicit` application schemas for typed schema and
  bound-model `softDelete` surfaces. Its owner handler sets only the protected
  `isDeleted` field and returns the persisted postimage.
- The generic Access and Hooks engines discover the command without importing
  the product plugin. PostgreSQL proves its independent policy and lifecycle,
  protected target lookup, rollback, non-disclosing repetition, retained hard
  delete, and direct plus bound-model execution.
- Canonical owner bindings publish only the explicit REST route and GraphQL
  field. Real PostgreSQL executions pass through REST, networkless GraphQL, and
  Yoga; replace and disabled schemas appear in neither transport surface.
- Core surface compilation now validates command selections and field-name
  collisions from the staged compiler output instead of reading unpublished
  schema metadata. Static mutation providers remain dormant when no schema
  selects their command and gain no Runtime or transport effect.
- Verified with focused Core, Access, Hooks, REST, GraphQL, Typegen, plugin and
  PostgreSQL suites, plus full `yarn typecheck`, `yarn test`, `yarn lint`, and
  `NODE_OPTIONS=--max-old-space-size=8192 yarn build`.
