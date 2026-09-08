# 2403: Execute nested create and connect

- Status: completed
- Milestone: 24
- Packages: `@ultimabase/core`, `@ultimabase/hooks-plugin`,
  `@ultimabase/access-plugin`, `@ultimabase/postgres-plugin`
- Depends on: 2402
- ADR: ADR-0243

## Goal

Execute recursive pointer and relation `create` and `connect` nodes through the
ordinary Runtime inside the root mutation's automatic transaction.

## Acceptance criteria

- [x] The executor deterministically orders target-before-source pointer
      creation, source-before-child inverse-pointer creation, and owning edge
      creation only after both persisted identities exist.
- [x] Every created object runs the same structural validation, optional
      Validation, Hooks, Access, ACL, constraints, persistence rewrites, and
      materialization as its standalone `createOne` equivalent exactly once.
- [x] Every connect uses the existing protected pointer or relation boundary,
      verifies the exact target application/schema/ID, and preserves protected
      not-found equivalence for absent, foreign, or policy-hidden targets.
- [x] Recursive nested data inherits exact request values, anonymous or audited
      Master authority, cancellation, transaction ownership, Hook lease, and
      callback attribution without accepting shaped input authority.
- [x] Any normalization, target, policy, Hook, adapter, projection, or
      finalization failure rolls back root objects, child objects, edges,
      events, and Hook-started work.
- [x] PostgreSQL reuses existing create, pointer, relation, and transaction
      capabilities; Core issues no SQL and the adapter gains no opaque nested
      mutation shortcut.

## Tests

- [x] Fixture-adapter and PostgreSQL matrices cover pointer creation, owning and
      inverse relations, mixed create/connect, multiple levels, policy denial,
      Master, cancellation, failure ordering, and complete rollback.

## Out of scope

- Nested target update, disconnect, set, clear, delete, or upsert; transport
  decoding; and root collection commands.
