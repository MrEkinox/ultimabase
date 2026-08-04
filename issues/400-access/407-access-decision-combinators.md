# 407: Add composable Access decision helpers

- Status: completed
- Milestone: 4
- Packages: `@ultimabase/core`
- Depends on: 401, 421, 422
- ADR: ADR-0116

## Goal

Keep native schema and field Access concise when one decision accepts several
independent subjects or conditions, without recreating a CLP configuration
language.

## Target developer experience

```ts
access: {
	operation: {
		read: true,
		update: anyOf(isOwner('author'), hasRole(Editor)),
		delete: hasRole(Administrator),
	},
}
```

## Acceptance criteria

- [x] `anyOf`, `allOf`, and `not` compose direct booleans plus synchronous or asynchronous Access decision callbacks.
- [x] Evaluation is deterministic, short-circuited, cancellation-aware, and does not change the logical `AND` composition between separate Access contributions.
- [x] Helpers preserve the exact input type inferred from their position, including schema terminal kinds and field disclosure channels.
- [x] Empty `anyOf` or `allOf` declarations are rejected as likely configuration mistakes, and `not` accepts exactly one decision.
- [x] Combinators retain supplied callback identity where wrapping is unnecessary and introduce no setup registry, service requirement protocol, or provider lookup.
- [x] Helpers allocate no per-request registry, builder, or policy object and add no authenticated, owner, role, CLP, or ACL vocabulary to Core.
- [x] Public JSDoc explains OR-within-one-rule versus AND-between-contributions and includes focused examples.

## Tests

- [x] Runtime, async, short-circuit, cancellation, empty-input, type-inference, language-service, public-export, and packed-package tests.

## Out of scope

- Combining Access filters, which already express logical branches through the typed filter builder.
- Built-in authenticated, owner, role, tenant, or ACL decisions.
