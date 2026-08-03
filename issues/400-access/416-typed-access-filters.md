# 416: Define typed Access filters

- Status: completed
- Milestone: 4
- Packages: `@ultimabase/core`
- Depends on: 304, 401, 421
- ADR: ADR-0053, ADR-0054, ADR-0102, ADR-0116

## Goal

Provide an immutable schema-aware filter builder for Access row restrictions
without exposing or mutating the developer Query.

## Target developer experience

```ts
access: {
	filter: {
		read: ({ context, filter }) => {
			const principal = context.getValue(principalToken)

			return principal === undefined
				? false
				: filter.equalTo('authorId', principal.id)
		},
		update: ({ filter }) => filter.equalTo('locked', false),
		delete: false,
	},
}
```

## Acceptance criteria

- [x] `AccessFilter<TSchema>` reuses the existing typed filter field/operator/value contracts and logical normalization rather than creating a second Query AST.
- [x] The builder exposes only predicates and logical composition; selection, ordering, pagination, limits, terminals, and execution are impossible.
- [x] A callback may synchronously or asynchronously return the supplied filter, `true` for every row, or `false` for no rows.
- [x] Filters exist for read, update, delete, and upsert target resolution; create uses operation or item access because no row exists yet.
- [x] Filter callbacks receive `context` and the typed builder but no terminal `kind`; one row universe applies consistently to every terminal in that operation family.
- [x] Access predicates remain separate from the public Query and Operation AST even when they use the same normalized filter node representation internally.
- [x] Multiple filters compose exclusively through logical `AND` and cannot remove a predicate contributed earlier.
- [x] Undefined plugin-owned context values require an explicit policy decision and never broaden a filter accidentally.
- [x] Public methods provide exact autocomplete, English JSDoc, immutable branching, and compact hovers.

## Tests

- [x] Runtime tests cover all built-in field operators, nested logical groups, `true`, `false`, branching immutability, and malformed callback results.
- [x] Compile-time tests cover exact field names, operator capabilities, values, and incompatible schemas.
- [x] Language-service and packed-package tests verify the restricted builder surface and documentation.

## Out of scope

- Compiling filters to SQL.
- Business defaults such as ordering or limits, which remain `beforeFind` concerns.
