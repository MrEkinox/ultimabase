# 401: Define native Access declarations

- Status: completed
- Milestone: 4
- Packages: `@ultimabase/core`
- Depends on: 103, 324, 350
- ADR: ADR-0006, ADR-0113, ADR-0116
- Refined by: 436, ADR-0169

## Goal

Expose precisely typed `access` declarations on every schema and field without
requiring a permission plugin.

## Target developer experience

```ts
const Post = Schema.define({
	className: 'Post',
	access: {
		operation: {
			read: ({ context }) => true,
			create: ({ context }) => true,
			update: ({ context }) => true,
			upsert: ({ context }) => true,
			delete: ({ context }) => context.access.mode === 'master',
		},
		filter: {
			read: ({ where }) => where.eq('published', true),
		},
		item: {
			update: ({ input, item }) => item.authorId === input.authorId,
		},
	},
	fields: {
		secret: stringField({
			access: {
				read: {
					item: ({ context }) => context.access.mode === 'master',
					filter: false,
					order: false,
				},
				create: true,
				update: false,
			},
		}),
	},
})
```

## Acceptance criteria

- [x] Schema declarations distinguish `operation`, `filter`, and `item` without exposing terminal cardinality-specific property names.
- [x] Field declarations distinguish `read`, `filter`, `order`, `create`, and `update`; field delete remains a schema or item decision.
- [x] Rules accept a direct boolean or a callback returning the exact value directly or asynchronously.
- [x] Asynchronous declarations receive cancellation and an effect-free typed Access context; deterministic execution remains owned by issue 418.
- [x] Schema callbacks infer the exact operation family, create or update input, prepared item, and immutable request context; inline field callbacks infer their exact logical value and family while schema and field identity remain their private compilation targets.
- [x] The exact terminal remains available through a discriminant when behavior must differ without duplicating `one` and `many` declarations.
- [x] Access declarations are retained through private schema capabilities and never change structural schema metadata, migrations, inferred object values, or compact field hovers.
- [x] Core declarations contain no authenticated user, owner, role, CLP, or ACL rule node; plugins resolve those concepts from optional typed context values or services.
- [x] Omitted declarations follow the application Access default rather than installing placeholder callbacks on every schema or field.
- [x] Public JSDoc explains every level with concise examples and preserves autocomplete on schema and field options.

## Tests

- [x] Runtime normalization tests cover booleans, synchronous and asynchronous callbacks, immutability, invalid direct rules, unknown properties, and absent declarations.
- [x] Compile-time tests prove exact context, callback results, input, item, field-value, and operation-family inference.
- [x] TypeScript language-service and packed-package tests verify autocomplete, documentation, and compact QuickInfo.

## Implementation notes

- Issue 421 is the explicit follow-up that groups schema read cardinalities and
  field disclosure channels. This completed issue records the original flat
  declaration foundation rather than rewriting its historical acceptance
  criteria after the public contract was reconsidered.
- Operation rules receive only `context` and `kind`. Inputs belong to
  `item` rules, which avoids rebuilding the complete Query and Operation AST in
  every Access callback and keeps editor response times stable.
- Issue 401 exposes the schema-aware row-policy boundary required by native
  declarations. Issue 416 and ADR-0167 align it with the canonical `WhereInput`
  contract and its immutable builder utility.

## Out of scope

- Evaluating declarations in Runtime.
- Concrete authenticated, role, ownership, CLP, ACL, or SQL rules.
- Transport-specific denial responses.
