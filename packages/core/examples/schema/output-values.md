# Output-only values

An `OutputBuilder` callback declares the shape of a returned value without
declaring a stored field or mutation input. Keeping the callback reusable also
preserves its exact inferred value for the virtual-field API delivered by a
later schema issue:

```ts
import type { OutputBuilder, OutputValue } from '@ultimabase/core'

export const declareProfileSummary = (output: OutputBuilder) =>
	output.object({
		typeName: 'ProfileSummary',
		nullable: false,
		fields: (output) => ({
			displayName: output.string({ nullable: false }),
			status: output.enum({
				values: ['active', 'disabled'],
				nullable: false,
			}),
			tags: output.string({ list: true, nullable: false }),
			avatarUrl: output.string(),
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
such as `default`, `required`, `immutable`, `indexed`, `autoNow`, validation,
`pointer`, and `relation` belong to stored or input-capable fields and are not
available here. The callback itself does not resolve a value; an owning schema
feature such as a virtual field supplies when and how it executes.
