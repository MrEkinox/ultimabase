# ADR-0130: Contextual schema extension binding

- Status: superseded
- Date: 2026-08-04
- Refines: ADR-0002, ADR-0088, ADR-0129
- Superseded by: ADR-0213

## Context

A schema extension may expose callbacks whose values should follow the exact
sibling fields declared by an application. ACL defaults and input resolution
are the first concrete case. Requiring `acl<ManualData>()` duplicates the
schema, drifts as fields change, and weakens autocomplete.

TypeScript cannot propagate a generic inferred by `Schema.define()` backward
through the arguments of an already evaluated nested call such as
`extensions: [acl({ default: ({ data }) => ... })]`. Contextual return typing
works only after the sibling-field type is already fixed. Keeping that array
syntax would therefore require a broad string index or an explicit manual
generic, neither of which meets the public DX contract.

## Decision

`Schema.define()` accepts both its existing immutable extension tuple and a
contextual extension declaration:

```ts
const Post = Schema.define({
	className: 'Post',
	fields: {
		title: stringField({ validation: { required: true } }),
		visibility: stringField(),
	},
	extensions: ({ bind }) => [
		bind(acl, {
			default: ({ data }) => {
				data.title // string
				data.visibility // string | undefined

				return new ACL()
			},
		}),
	],
})
```

`bind()` is a neutral Core protocol. A package declares the relationship
between its data context, options, and resulting extension once through
`SchemaExtensionContextKind` and
`defineContextualSchemaExtensionFactory()`. Core never imports or names that
package. Binding invokes the ordinary package factory immediately, so the
schema stores the same immutable extension object and runtime identity as the
non-contextual form.

The context data is the persisted-value inference of the exact developer
`fields` map:

- required and defaulted output fields are required;
- optional fields remain optional and nullable fields retain `null`;
- lists preserve every declared dimension;
- object fields preserve their exact nested value;
- pointers preserve their exact target schema;
- community plugin-defined fields preserve their logical value type;
- framework system fields and fields reserved by schema extensions are absent.

This rule prevents one extension callback from accidentally depending on
another extension's private storage field. Runtime callbacks receive the same
developer-field projection.

## Consequences

- Applications gain exact completion and concise hover types without a manual
  data interface.
- Existing extension arrays and ordinary extension objects remain valid and
  retain their current inference.
- Callback-bearing extensions use the explicit `({ bind }) => [...]` form when
  they need sibling-field inference.
- Extension authors add a small higher-kinded type declaration once; application
  code remains independent from that type machinery.
