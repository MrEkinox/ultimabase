# ADR-0133: Canonical null for optional field values

- Status: accepted
- Date: 2026-08-05
- Refines: ADR-0014, ADR-0019, ADR-0021, ADR-0060, ADR-0079, ADR-0085, ADR-0091

## Context

UltimaBase previously modeled property presence and nullability independently.
An optional non-null field could therefore be absent, while an explicitly
nullable field could contain `null`. This produced three states in complete
models: a value, `null`, or an absent property.

The distinction added branching throughout inference, validation, hooks,
queries, adapters, and transports. It also exposed a document-storage concern
through static schemas even though PostgreSQL and GraphQL naturally represent
an empty selected value as `null`.

## Decision

### Optional persisted values use null

Every selected field in a complete model is present. A field declared with
`validation.required: true` has the exact logical value `T`; every other field
has the logical value `T | null`. The public `validation.nullable` option is
removed because nullability is derived from the required invariant.

Lists remain non-null collections of non-null items when required and become
`readonly T[] | null` when optional. Nested object properties follow the same
rule recursively. A JSON field still requires an object or array at its root
when non-null, while an optional JSON field may contain `null`.

### Inputs retain operation-specific omission

Create input does not require callers to supply every optional field. Omitting
an optional field produces `null` after defaults and input resolvers have run.
An explicit `null` remains `null` and does not activate a default.

A required field may still be omitted when a default, automatic value, or
trusted input resolver guarantees it. Combining `required: true` with a default
therefore gives an optional create property and a non-null persisted value.

Update input remains a partial command. Omitting a property means no change;
supplying `null` clears an optional field. Required fields reject `null`.
Because clearing is expressed through the regular replacement value, the
separate `unset` update operator is removed.

### Absence remains structural outside persisted state

A read projection, Access restriction, or transport selection may omit a field
that was not loaded or cannot be exposed. That structural absence does not
represent the field's persisted value. Runtime and adapters preserve this
distinction through selection metadata rather than `undefined` field values.

Physical database absence and legacy SQL `NULL` values both decode to logical
`null` for optional selected fields. Encoders continue to reject `undefined`.

### Queries observe values, not property presence

Persistent property absence is no longer a queryable state. The field-filter
methods `exists(field)` and `doesNotExist(field)` are replaced by
`isNotNull(field)` and `isNull(field)`. The read terminal `query.exists()` is
unchanged because it tests whether any row matches a query.

## Consequences

- Complete-model hovers expose stable required properties with either `T` or
  `T | null`.
- Create and update inputs keep optional properties, so callers never need to
  provide `null` for every non-required field.
- Defaults distinguish omission from explicit `null`; `required: true` remains
  the way to prohibit clearing a defaulted value.
- Hooks and Access callbacks receive logical `null` for an empty selected
  optional field while still observing omitted update properties as no change.
- PostgreSQL optional columns remain nullable, but row decoding no longer drops
  `NULL` properties.
- Transports normalize their own selection representation without restoring a
  third persisted value state.
