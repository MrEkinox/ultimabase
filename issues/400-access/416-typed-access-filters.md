# 416: Define typed Access filters

- Status: ready
- Milestone: 4
- Packages: `@ultimabase/core`
- Depends on: 304, 401
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

- [ ] `AccessFilter<TSchema>` reuses the existing typed filter field/operator/value contracts and logical normalization rather than creating a second Query AST.
- [ ] The builder exposes only predicates and logical composition; selection, ordering, pagination, limits, terminals, and execution are impossible.
- [ ] A callback may synchronously or asynchronously return the supplied filter, `true` for every row, or `false` for no rows.
- [ ] Filters exist for read, update, delete, and upsert target resolution; create uses operation or item access because no row exists yet.
- [ ] Access predicates remain separate from the public Query and Operation AST even when they use the same normalized filter node representation internally.
- [ ] Multiple filters compose exclusively through logical `AND` and cannot remove a predicate contributed earlier.
- [ ] Undefined plugin-owned context values require an explicit policy decision and never broaden a filter accidentally.
- [ ] Public methods provide exact autocomplete, English JSDoc, immutable branching, and compact hovers.

## Tests

- [ ] Runtime tests cover all built-in field operators, nested logical groups, `true`, `false`, branching immutability, and malformed callback results.
- [ ] Compile-time tests cover exact field names, operator capabilities, values, and incompatible schemas.
- [ ] Language-service and packed-package tests verify the restricted builder surface and documentation.

## Out of scope

- Compiling filters to SQL.
- Business defaults such as ordering or limits, which remain `beforeFind` concerns.
