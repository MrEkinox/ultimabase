# ADR-0040: Explicit temporal autoNow generation

- Status: accepted
- Date: 2026-07-31
- Supersedes: the temporal magic-default portions of ADR-0026 and ADR-0038

## Decision

`dateField`, `timeField`, and `dateTimeField` accept `autoNow: true` to request
one framework-generated temporal value when a create input omits the field.
Runtime derives every such value from the operation-scoped clock and application
timezone. Calendar dates receive the current day, times receive the current
time, and date-times receive the complete current date and time in their
declared timezone representation.

`autoNow` is a field-generation option rather than a disguised default value.
It is mutually exclusive with `default` and with list metadata because one
clock instant does not define an entire list. `autoNow: false` is an explicit
no-op and remains valid metadata.

The developer may still provide the field during create and update operations.
`autoNow` only fills an omitted create value; it does not refresh a value during
updates. Future automatic update timestamps require separate explicit metadata
rather than changing this contract.

The former `default: "today"` and `default: "now"` forms are removed. Static
temporal defaults must be valid values, while developer-owned generation uses a
zero-argument default factory.

## Consequences

Runtime recognizes one explicit boolean instead of rediscovering magic strings
from a field kind and default value. A required field with `autoNow: true` is
required in persisted output but optional in create input.

System timestamps continue to use their existing `generatedOn` metadata.
`autoNow` provides equivalent create-time clock access for developer temporal
fields without exposing system-field internals.
