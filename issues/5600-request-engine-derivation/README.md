# Milestone 56 — Request-engine derivation

- Status: completed
- Authorization: user request of 2026-09-27
- Baseline: `1772b024`

This milestone consolidates repeated construction of context-, master-, and
transaction-derived request engines behind one private Core path. Application,
context, pipeline, transaction lifetime, authority, and execution behavior stay
unchanged.

## Execution order

- [x] [5601 — Consolidate request-engine derivation](5601-consolidate-request-engine-derivation.md)

## Constraints

- Preserve the exact framework, context, pipeline, and transaction lifetime on
  every derived engine.
- Preserve plugin-operation and schema-mutation host registration.
- Preserve automatic and explicit transaction behavior, Master auditing,
  cancellation, relation scopes, and protected-denial handling.
- Add no public constructor, factory, export, authority path, or lifecycle.
- Stop and revert if production TypeScript does not delete lines overall.

No push is authorized.

## Outcome

One private derivation method now owns all four context-, Master-, schema-
mutation-, and transaction-scoped RequestEngine constructions. Plugin-operation
and schema-mutation bridges also reuse one transaction callback and optional
lifetime description. `request-engine.ts` falls from 531 to 518 lines;
production TypeScript removes 13 lines net.
