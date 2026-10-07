# ADR-0129: Proposed logical data for ACL input resolution

- Status: accepted
- Date: 2026-08-04
- Refines: ADR-0122, ADR-0123

## Context

ACL exposes one `resolveInput` callback for create and singular update so a
schema can reuse its row-specific policy. The original create branch called
`data` the complete field-resolved create candidate. The update branch used the
same name for a partial object assembled only from operations carrying a
`value`. It silently omitted unchanged fields and `unset`, and represented an
increment by its delta rather than the proposed value.

That mismatch makes shared callbacks unsafe. It also cannot be fixed by
pretending the adapter result already exists: ACL resolution runs before the
database mutation so it may validate or replace the proposed ACL inside the
same transaction.

## Decision

`data` always means the immutable proposed logical developer-field snapshot
without the reserved ACL field:

- on create, it is the field-resolved create candidate;
- on update, Runtime applies the validated normalized update to the locked
  current row before the ACL callback runs.

The adapter-neutral update application supports `set`, `unset`, exact
`bigint` and decimal arithmetic, and numeric increment or decrement. Unchanged
developer fields remain present. Framework-owned `id`, `createdAt`, and
`updatedAt` are excluded so both branches retain the same schema-local data
shape. The candidate is a proposal, not a post-adapter result.

The update branch additionally exposes:

- `currentData`, the immutable locked developer-field preimage;
- `update`, the immutable normalized non-ACL operation list, including
  framework-generated operations such as `updatedAt`;
- `currentAcl` and `inputAcl`, which retain their existing exact meanings.

Create exposes `currentData: undefined` and `update: undefined`, preserving one
discriminated callback contract. Ordinary updates that do not replace the ACL
never invoke ACL input resolution.

Core exports `applyUpdateExpressionToRecord()` as a policy-neutral Query AST
utility. It knows no ACL vocabulary and may be reused by other transaction-bound
plugins that own a locked logical record.

## Consequences

- One callback can safely derive ACLs from `data` for create and update.
- `unset`, numeric operators, unchanged fields, lists, and generated timestamps
  are no longer represented as misleading partial values.
- The callback still runs after the adapter locks the singular target but
  before adapter execution, so throwing rolls back the automatic transaction.
- Adapter-generated effects unavailable before execution are deliberately not
  promised as part of `data`.
