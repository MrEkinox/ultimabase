# 1801: Decide field-owned portable containment

- Status: completed
- Milestone: 18
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`, `@ultimabase/acl-permissions-plugin`
- Depends on: none
- ADR: ADR-0212

## Goal

Define the smallest adapter-neutral contract that lets the owner of a
JSON-backed plugin field opt into the existing structural `contains` Query
operator without exposing raw storage, SQL, or an arbitrary operator registry.

## Acceptance criteria

- [x] The ADR records the two current ACL consumers: request authorization and exact subject-reference discovery.
- [x] A plugin field may opt into existing structural containment only when it owns a portable JSON storage codec and a deterministic operand snapshot contract.
- [x] Logical field values, complete storage values, and partial containment operands remain distinct typed representations.
- [x] The decision defines whether and how the operator reaches ordinary developer Query authoring and protected policy row filters.
- [x] Core validates immutable portable operands and monotonic row-filter composition without learning plugin or adapter vocabulary.
- [x] Adapters consume the ordinary Query AST and field capability without receiving plugin callbacks or policy state.
- [x] Missing, incompatible, or malformed capability support fails closed before database execution.
- [x] The migration path supersedes the dedicated ACL/PostgreSQL bridge only after both ACL constraint families have moved.

## Tests

- [x] The ADR names the required Runtime, type, Typegen, packed, generic-adapter, PostgreSQL, ACL, and removal regressions for later issues.

## Decision evidence

- ADR-0212 grants only an explicit `structuralContains` opt-in to a non-list
  plugin scalar that already owns a portable JSON storage codec.
- The plugin snapshots a separate partial JSON operand; the complete logical
  value and complete storage codec never process that operand.
- Developer where inputs and protected policy row filters use the same existing
  `contains` AST leaf, while Core retains immutable normalization and logical
  `AND` composition.
- Adapters advertise the exact portable containment protocol and receive only
  inert metadata plus the detached operand, never the plugin snapshot callback.
- ACL authorization and reference discovery migrate together before the bridge
  package or its opaque contracts are removed.

## Validation

- `yarn check:issues`
- `yarn format:check`

## Out of scope

- Custom Query operator registration.
- Automatically granting key, JSONPath, ordering, range, or `containedBy` semantics.
- Making a storage codec's private representation queryable without an explicit field-owner declaration.
- Moving ACL vocabulary into Core or PostgreSQL.
