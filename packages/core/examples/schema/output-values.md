# Output-only values

An `OutputBuilder` callback declares the shape of a returned value without
declaring a stored field or mutation input. Keeping the callback reusable also
preserves its exact inferred value for `field.virtual`:

```ts
import type { OutputBuilder, OutputValue } from '@ultimabase/core'

export const declareProfileSummary = (output: OutputBuilder) =>
	output.object({
		typeName: 'ProfileSummary',
		fields: (output) => ({
			displayName: output.string(),
			status: output.enum({
				values: ['active', 'disabled'],
			}),
			tags: output.string({ list: true }),
			avatarUrl: output.string({ required: false }),
		}),
	})

export type ProfileSummary = OutputValue<
	ReturnType<typeof declareProfileSummary>
>
```

`ProfileSummary` is inferred as an exact readonly object. Its `displayName`,
`status`, and `tags` properties are non-null; `avatarUrl` is present with the
value `string | null`. List elements cannot be null.

Output options intentionally stop at value shape and representation. Options
such as `default`, `immutable`, `indexed`, `autoNow`, validation,
`pointer`, and `relation` belong to stored or input-capable fields and are not
available here. The callback itself does not resolve a value; an owning schema
feature such as a virtual field supplies when and how it executes.

A plugin may add an output-only value kind without turning its stored field into
an output descriptor. Its output-context factory returns a descriptor through
Core's provenance boundary:

```ts
import { definePluginOutputDescriptor } from '@ultimabase/core'

const ratingOutput = () =>
	definePluginOutputDescriptor(
		'community.rating',
		{ list: false, required: true },
		(value, path) => {
			if (typeof value !== 'number' || !Number.isFinite(value)) {
				throw new TypeError(`${path} must be a finite rating`)
			}
			return value
		},
	)
```

The matching builder method must declare the `output` context explicitly. Core
checks the namespaced kind, immutable normalized options, descriptor provenance,
and returned kind before accepting the declaration.
