# 416: Define typed Access filters

- Status: done
- Milestone: 4
- Packages: `@ultimabase/core`
- Depends on: 304, 401, 421
- ADR: ADR-0053, ADR-0054, ADR-0102, ADR-0116, ADR-0167

## Goal

Use the canonical schema-aware `WhereInput` contract for Access row
restrictions without exposing or mutating the developer Query. Keep
`WhereBuilder` as an immutable utility for dynamic composition.

## Target developer experience

```ts
access: {
	filter: {
		read: ({ context }) => {
			const principal = context.getValue(principalToken)

			return principal === undefined
				? false
				: { authorId: { eq: principal.id } }
		},
		update: () => ({ locked: { eq: false } }),
		delete: false,
	},
}
```

## Acceptance criteria

- [x] `WhereInput<TSchema>` is the source of truth and reuses the existing typed field/operator/value contracts and logical normalization rather than creating a second Query AST.
- [x] `WhereBuilder<TSchema>` remains an immutable utility and exposes no selection, ordering, pagination, terminal, or execution capability.
- [x] A callback may synchronously or asynchronously return a `WhereInput`, the supplied builder, `true` for every row, or `false` for no rows.
- [x] Filters exist for read, update, delete, and upsert target resolution; create uses operation or item access because no row exists yet.
- [x] Filter callbacks receive `context` and the typed builder but no terminal `kind`; one row universe applies consistently to every terminal in that operation family.
- [x] Access predicates remain separate from the public Query and Operation AST even when they use the same normalized filter node representation internally.
- [x] Multiple filters compose exclusively through logical `AND` and cannot remove a predicate contributed earlier.
- [x] Undefined plugin-owned context values require an explicit policy decision and never broaden a filter accidentally.
- [x] Relation and pointer predicates prepare target Access and adapter constraints recursively while trusted policy fields remain independent from public field-filter permission.
- [x] Public methods provide exact autocomplete, English JSDoc, immutable branching, and compact hovers.

## Tests

- [x] Runtime tests cover built-in field operators, relationship predicates, nested logical groups, `true`, `false`, branching immutability, and malformed callback results.
- [x] Compile-time tests cover exact field names, operator capabilities, values, and incompatible schemas.
- [x] Language-service and packed-package tests verify the restricted builder surface and documentation.

## Out of scope

- Transport-specific authoring or wire encoding of `WhereInput`.
- Business defaults such as ordering or limits, which remain `beforeFind` concerns.
