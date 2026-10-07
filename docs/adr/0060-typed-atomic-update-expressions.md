# ADR-0060: Typed atomic update expressions

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0004, ADR-0019, ADR-0059

## Decision

Developer and transport update input uses four optional groups named `set`,
`unset`, `increment`, and `decrement`, with at least one group required. Query
normalization converts those groups into one `UpdateExpression<TSchema>` that
contains a flat immutable operation list. Operations always follow group order,
then caller field order within each group.

`set` accepts every field retained by `InferUpdateInput<TSchema>` and correlates
it with that field's exact update value. `unset` accepts only mutable fields
whose `InferObject<TSchema>` property may be absent. Required, defaulted,
auto-generated, and auto-incremented output fields therefore cannot be removed.

`increment` and `decrement` accept mutable scalar `int`, `float`, `bigint`, and
`decimal` fields. Lists and other field kinds are rejected. Deltas exclude null
and preserve the field's exact scalar representation, including native bigint
and exact decimal strings. Numeric deltas pass through the field-owned scalar
snapshot capability, which validates representation without applying the final
stored value's range constraints to the delta itself.

One expression may operate on a field exactly once. Reusing a field across two
groups, or repeating it inside `unset`, is a normalization error. Unknown
groups, malformed group shapes, unknown fields, immutable fields, framework
system fields, undefined set values, and empty expressions also fail before an
operation reaches Runtime.

The normalized root, operation collection, and operation records are immutable.
Set values are not structurally validated or snapshotted by Query: object update
values are partial shapes, while Schema's declaration snapshot boundary models
complete values. Runtime applies the update validation plan and creates the
trusted value snapshot through the shared structural-validation pipeline.

Plugin fields inherit `set` and eligible `unset` behavior from their inference
contract. They do not implicitly gain arithmetic behavior from a number-like
TypeScript value; an owning plugin must later contribute an explicit portable
operator capability.

## Consequences

Direct TypeScript calls preserve exact field/value inference, while REST and
GraphQL can normalize the same grouped shape. Database adapters receive a
small, exhaustive atomic node union instead of interpreting transport objects.

System and immutable fields are excluded statically and checked again at the
runtime normalization boundary. Conflicts cannot depend on adapter ordering,
and update operations remain separate from create inputs as required by the
terminal Operation AST.
