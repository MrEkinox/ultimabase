# 1801: Decide field-owned portable containment

- Status: ready
- Milestone: 18
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`, `@ultimabase/acl-permissions-plugin`
- Depends on: none
- ADR: new ADR required

## Goal

Define the smallest adapter-neutral contract that lets the owner of a
JSON-backed plugin field opt into the existing structural `contains` Query
operator without exposing raw storage, SQL, or an arbitrary operator registry.

## Acceptance criteria

- [ ] The ADR records the two current ACL consumers: request authorization and exact subject-reference discovery.
- [ ] A plugin field may opt into existing structural containment only when it owns a portable JSON storage codec and a deterministic operand snapshot contract.
- [ ] Logical field values, complete storage values, and partial containment operands remain distinct typed representations.
- [ ] The decision defines whether and how the operator reaches ordinary developer Query authoring and protected policy row filters.
- [ ] Core validates immutable portable operands and monotonic row-filter composition without learning plugin or adapter vocabulary.
- [ ] Adapters consume the ordinary Query AST and field capability without receiving plugin callbacks or policy state.
- [ ] Missing, incompatible, or malformed capability support fails closed before database execution.
- [ ] The migration path supersedes the dedicated ACL/PostgreSQL bridge only after both ACL constraint families have moved.

## Tests

- [ ] The ADR names the required Runtime, type, Typegen, packed, generic-adapter, PostgreSQL, ACL, and removal regressions for later issues.

## Out of scope

- Custom Query operator registration.
- Automatically granting key, JSONPath, ordering, range, or `containedBy` semantics.
- Making a storage codec's private representation queryable without an explicit field-owner declaration.
- Moving ACL vocabulary into Core or PostgreSQL.
