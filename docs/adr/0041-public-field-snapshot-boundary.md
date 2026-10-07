# ADR-0041: Public field snapshot boundary

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0033, ADR-0039

## Decision

Schema exports `snapshotScalarFieldValue(field, value, path)` as the public
runtime boundary for applying a declared field's registered logical-scalar
capability. Its return type follows the exact scalar value before framework list
metadata applies.

The function accepts unknown input, verifies factory provenance through the
private capability registry, and delegates the value to the field-owned scalar
snapshot function. It does not inspect list metadata, select a default, or
execute a field default.

Runtime traverses array and object nodes through the structural validation plan.
At each scalar node it passes the unknown leaf value through
`snapshotScalarFieldValue`. Plugins therefore retain ownership of their logical
scalar snapshots while Runtime avoids deep Schema imports and switches that
duplicate binary or community-field behavior.

## Consequences

The capability registry remains private and cannot be forged through structural
field objects. Only its safe application operation becomes public.

Mutable scalar values are detached at Runtime input and default boundaries using
the same behavior already used during schema declaration. Array and object
containers remain owned by the plan executor because create, update, and list
replacement have different structural semantics.
Validation remains a separate Runtime concern; a successful snapshot proves the
field's structural value contract, not access permission or every declarative
constraint.
