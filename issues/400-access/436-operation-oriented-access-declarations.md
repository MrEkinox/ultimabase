# 436: Restructure Access declarations around operations

- Status: completed
- Milestone: 4
- Packages: `@ultimabase/core`, official policy plugins
- Depends on: 416, 417, 418, 421, 422
- ADR: ADR-0169
- Refined by: 437, ADR-0170

## Goal

Make the complete policy for one schema operation readable in one place while
preserving the existing monotonic Access lifecycle and its private compiled
plan.

## Target developer experience

```ts
const Post = Schema.define({
	className: 'Post',
	access: {
		read: {
			allow: { one: true, many: true, count: false, exists: true },
			where: { published: { eq: true } },
		},
		update: {
			allow: ({ context }) => context.access.mode === 'master',
			where: ({ where }) => where.eq('locked', false),
			item: ({ originalItem, item }) => item.authorId === originalItem.authorId,
		},
		delete: false,
	},
	fields: {
		secret: stringField({
			access: {
				read: { output: false, filter: false, order: false },
				create: true,
				update: false,
			},
		}),
	},
})
```

## Acceptance criteria

- [x] Schema Access is organized by `read`, `create`, `update`, `upsert`, and `delete` rather than separate `operation`, `filter`, and `item` objects.
- [x] A direct boolean or decision callback is the concise `allow` form for one operation family.
- [x] Detailed operation objects expose only the applicable `allow`, `where`, and `item` stages.
- [x] Read `allow` retains the concise shared rule and complete `one`, `many`, `count`, and `exists` forms.
- [x] `where` accepts a canonical typed `WhereInput` directly or a synchronous or asynchronous callback returning `WhereInput`, `WhereBuilder`, or `undefined` for no additional restriction.
- [x] `where` no longer accepts booleans; denial belongs to `allow`.
- [x] Schema item callback inputs omit redundant `kind`; delete exposes `originalItem` without a public `item: null` property, while upsert retains its materialization `mode`.
- [x] Field read objects rename `item` to `output`; direct booleans remain concise, while a shared read callback and public `channel` discriminant are removed.
- [x] Field output, filter, order, create, and update callbacks expose only their relevant context and values without terminal `kind`.
- [x] Developer and plugin declarations normalize to the existing private monotonic operation, row, item, and field plan without changing enforcement order.
- [x] Previous declaration shapes fail structural validation instead of being silently merged.
- [x] Public source and packed-package IntelliSense is precise under the repository's stable TypeScript version.
- [x] Core and affected plugin documentation, examples, ADR links, issue status, and a Changeset describe the new contract.

## Tests

- [x] Type and language-service tests cover root operation completion, detailed stage completion, direct typed where objects, builder callbacks, item materializations, field output naming, and rejected legacy shapes.
- [x] Declaration and plan tests prove immutable normalization into the unchanged private lifecycle.
- [x] Runtime tests preserve operation denial, row restriction, per-item decisions, field disclosure, asynchronous callbacks, relation traversal, and master behavior.
- [x] Packed exports and PostgreSQL Access E2E tests use the new public shape.

## Out of scope

- Changing the Access execution order or monotonic composition rules.
- Adding concrete owner, role, tenant, ACL, or authentication vocabulary to Core.
- Moving inline field Access declarations away from their field definitions.
- Adding database, event, transaction, or hook capabilities to Access callbacks.
