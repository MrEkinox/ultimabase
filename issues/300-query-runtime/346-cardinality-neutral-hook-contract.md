# 346: Preserve cardinality-neutral hook families

- Status: superseded
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 327, 334, 336
- ADR: ADR-0089, ADR-0109

ADR-0163 replaces the flat hook names in this proposal, and ADR-0164 removes
public collection cardinality from item hooks and Access. The accepted grouped
contract is documented by those records rather than this earlier target.

## Goal

Keep one public hook phase per operation family as bulk grouping and itemized
terminals evolve, without forcing developers to duplicate handlers for
singular and collection variants.

## Target developer experience

```ts
const Post = Schema.define({
	className: 'Post',
	fields: {},
	hooks: {
		beforeCreate: ({ operation }) => {
			if (operation.kind === 'create-many') {
				// Cardinality-specific behavior remains an explicit optional branch.
			}

			return operation
		},
	},
})
```

## Acceptance criteria

- [ ] Schema and field APIs expose family phases such as `beforeCreate`, `afterUpdate`, and `beforeSave`, never `beforeCreateOne`, `beforeCreateMany`, or equivalent cardinality-specific phase names.
- [ ] One handler continues to cover every compatible singular, bulk, set-based, and explicit itemized terminal.
- [ ] The exact terminal remains available through the immutable `operation.kind` discriminant when cardinality-specific behavior is necessary.
- [ ] Item hooks introduced by bulk grouping execute per item without creating another public hook declaration family.
- [ ] Set-based `updateMany` and `deleteMany` retain operation-level hooks without manufacturing field values or per-object callbacks.
- [ ] Plugin hook targets follow the same family contract as developer-declared hooks.
- [ ] Public documentation explains that `one` and `many` belong to Query terminal semantics rather than hook phase naming.

## Tests

- [ ] Compile-time regression tests reject cardinality-specific hook properties and retain exact `operation.kind` narrowing.
- [ ] Runtime tests prove that one family handler observes singular and collection terminals in the documented order.
- [ ] TypeScript language-service tests verify that autocomplete offers only the cardinality-neutral phase names.
- [ ] PostgreSQL E2E coverage proves that bulk and itemized implementations do not duplicate operation-level handlers.

## Out of scope

- Removing terminal cardinality discriminants from the Operation AST.
- Hiding whether a hook is processing a singular, set-based, or itemized operation.
- Making set-based updates and deletes materialize matching rows.
