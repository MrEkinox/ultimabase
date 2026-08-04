# 144: Contextualize schema extension callbacks from sibling fields

- Status: planned
- Milestone: 1
- Packages: `@ultimabase/core`, `@ultimabase/acl-permissions-plugin`
- Depends on: 126, 143, 431
- ADR: new ADR required if public declaration syntax changes

## Goal

Let typed schema extensions receive the exact inferred sibling-field data in
their callbacks without requiring developers to duplicate a manual generic.

## Target developer experience

```ts
const Post = Schema.define({
	className: 'Post',
	fields: {
		title: stringField({ validation: { required: true } }),
		visibility: stringField(),
	},
	extensions: [
		acl({
			default: ({ data }) => {
				data.title // string with autocomplete and hover documentation
				data.visibility // string | undefined

				return new ACL()
			},
		}),
	],
})
```

## Acceptance criteria

- [ ] Extension callback data is inferred from the exact schema fields without `acl<ManualData>()` or duplicated interfaces.
- [ ] The mechanism is generic to typed schema extensions; Core never imports or names ACL.
- [ ] Required, optional, structured, plugin-defined, list, pointer, and system-field behavior has one documented inference rule.
- [ ] Callback hovers remain concise and show developer values instead of extension implementation types.
- [ ] Ordinary extension objects without callbacks retain their current inference and runtime identity.
- [ ] If TypeScript cannot support the current declaration shape, an ADR selects the smallest reusable syntax change before implementation.
- [ ] Schema examples and extension-author documentation are updated.

## Tests

- [ ] Type and language-service tests verify property completion, hover types, errors for unknown fields, and compiled package exports.
- [ ] The ACL extension provides the end-to-end proof without ACL-specific inference code in Core.
