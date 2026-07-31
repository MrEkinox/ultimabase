# ADR-0021: Field list metadata

- Status: accepted
- Date: 2026-07-31
- Supersedes: ADR-0017

## Decision

Every developer field kind may declare homogeneous list wrapping through its
common options. `list: true` represents one list level, `list: false` explicitly
keeps the scalar value, and a non-empty tuple containing only `true` values
represents its exact nested depth.

List metadata does not change the field kind. For example,
`stringField({ list: true })` remains a `string` field definition while its
inferred value is `readonly string[]`. Validation-plan compilation creates
transport-neutral array wrappers around the original scalar or object plan.

`validation.nullable` applies to the complete field value. List elements are
required and non-null; element-level presence has no meaning. Defaults and
operation-specific inference apply the same list depth to the underlying field
value.

The dedicated `arrayField`, `ArrayField`, and `ArrayFieldOptions` APIs are
removed. UltimaBase is pre-release, so retaining a deprecated duplicate API
would add ambiguity and maintenance cost without a compatibility benefit.

PostgreSQL adapters will map portable lists and structured objects to JSONB by
default. A later PostgreSQL-specific extension may opt compatible homogeneous
scalar lists into native array storage. Nested indexes must still be compiled
explicitly or rejected during adapter setup.

## Consequences

Field declarations are closer to Nexus-style list configuration and reuse the
same validation, extension, default, and inference code paths as scalar values.

Nested list depth remains explicit without constructing artificial field
definitions. Adapters inspect `options.list` in addition to the original field
kind when selecting physical storage.
