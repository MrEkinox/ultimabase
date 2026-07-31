# ADR-0034: Object defaults use create-input presence

- Status: accepted
- Date: 2026-07-31

## Decision

A static `objectField` default uses the same child presence rules as
`InferCreateInput`. A child is required only when it declares
`validation.required: true` and is not supplied by a default, generation, or
auto-increment metadata. Optional and supplied children may be omitted. Unknown
properties remain errors, and every provided value is snapshotted through its
declared child field.

The object field's persisted value still uses `InferObject` semantics. Its
static default input is typed separately with create-input semantics so runtime
normalization and TypeScript reject the same incomplete values.

This decision replaces ADR-0030's requirement that every declared object child
must appear in a static default.

## Consequences

Reusable partial object defaults no longer need placeholder values for optional
children. Required children with their own defaults may be omitted and resolved
later by Runtime using the compiled nested plans. Unknown or incorrectly typed
provided children still fail during declaration.
