# 401: Define native Access declarations

- Status: ready
- Milestone: 4
- Packages: `@ultimabase/core`
- Depends on: 103, 324, 350
- ADR: ADR-0006, ADR-0113, ADR-0116

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
			read: ({ filter }) => filter.equalTo('published', true),
		},
		item: {
			update: ({ input, item }) => item.authorId === input.authorId,
		},
	},
	fields: {
		secret: stringField({
			access: {
				read: ({ context }) => context.access.mode === 'master',
				filter: false,
				order: false,
				create: true,
				update: false,
			},
		}),
	},
})
```

## Acceptance criteria

- [ ] Schema declarations distinguish `operation`, `filter`, and `item` without exposing terminal cardinality-specific property names.
- [ ] Field declarations distinguish `read`, `filter`, `order`, `create`, and `update`; field delete remains a schema or item decision.
- [ ] Rules accept a direct boolean or a callback returning the exact value directly or asynchronously.
- [ ] Asynchronous declarations remain deterministic, cancellable, and effect-free apart from explicitly supplied typed Access capabilities.
- [ ] Every callback infers the exact schema, operation family, create or update input, prepared item, field name, field value, and immutable request context appropriate to its level.
- [ ] The exact terminal remains available through a discriminant when behavior must differ without duplicating `one` and `many` declarations.
- [ ] Access declarations are retained through private schema capabilities and never change structural schema metadata, migrations, inferred object values, or compact field hovers.
- [ ] Core declarations contain no authenticated user, owner, role, CLP, or ACL rule node; plugins resolve those concepts from optional typed context values or services.
- [ ] Omitted declarations follow the application Access default rather than installing placeholder callbacks on every schema or field.
- [ ] Public JSDoc explains every level with concise examples and preserves autocomplete on schema and field options.

## Tests

- [ ] Runtime normalization tests cover booleans, synchronous and asynchronous callbacks, immutability, invalid results, unknown properties, and absent declarations.
- [ ] Compile-time tests prove exact context, input, item, field-value, and operation-family inference.
- [ ] TypeScript language-service and packed-package tests verify autocomplete, documentation, and compact QuickInfo.

## Out of scope

- Evaluating declarations in Runtime.
- Concrete authenticated, role, ownership, CLP, ACL, or SQL rules.
- Transport-specific denial responses.
