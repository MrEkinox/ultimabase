# ADR-0134: Unified field-oriented update data

- Status: accepted
- Date: 2026-08-05
- Refines: ADR-0059, ADR-0060, ADR-0132, ADR-0133

## Context

Typed updates previously grouped replacements and arithmetic operations under
`set`, `increment`, and `decrement` properties. Adding another operation would
add another top-level group, while developers usually reason about the field
they are changing first.

ADR-0133 also made `null` the canonical empty value for optional fields. A
separate structural unset operation is therefore unnecessary, although an
explicit spelling can still improve readability at call sites.

## Decision

### Update data is a field map

Schema update commands accept one non-empty `data` object whose keys are mutable
schema fields. Each field appears at most once, and JavaScript own-property
enumeration order is preserved during normalization.

A direct schema value replaces the field. Omitting a property means no change,
and `null` clears an optional field. Required fields reject `null` through their
schema-derived input type and Runtime validation.

```ts
await Post.updateOne({
	where: (where) => where.equalTo('id', postId),
	data: {
		title: 'Updated',
		summary: null,
		views: increment(2),
	},
})
```

### Operations are explicit values

The `increment(delta)` and `decrement(delta)` factories create immutable,
identity-branded values. They are accepted only for mutable scalar numeric
fields and retain each field's exact numeric representation, including decimal
strings and bigint values.

Brand identity distinguishes an operation from developer data that happens to
contain `kind` and `value` properties. Transports must parse their own explicit
wire representation and construct the same normalized operation nodes; Core
does not infer operations from arbitrary JSON object shapes.

The `unset()` utility returns `null`. It is readability sugar rather than a new
operation, so `field: unset()` normalizes to the same replacement node as
`field: null` and remains unavailable to required fields through typing.

### The normalized AST remains operation-oriented

Developer input is field-oriented, but normalization still emits explicit
`set`, `increment`, and `decrement` operation nodes. Runtime, policy plugins,
hooks, and adapters therefore retain one transport-neutral execution contract.

Future operations may add another branded input value and normalized node when
a concrete requirement exists. This decision does not introduce a public
operator registry or plugin extension point.

## Consequences

- Update call sites scale by field instead of accumulating top-level groups.
- A field cannot declare conflicting operations inside one JavaScript object.
- Direct object and JSON values cannot be mistaken for operations by shape.
- `unset()` provides an explicit spelling without restoring a distinct missing
  persisted state.
- Existing grouped update input is replaced rather than supported as a second
  public syntax.
