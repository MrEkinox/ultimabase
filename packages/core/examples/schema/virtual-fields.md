# Virtual fields

A virtual field computes a selectable result from persisted values without
creating a column, mutation input, filter, order key, index, or migration:

```ts
import { UltimaBase } from '@ultimabase/core'

export const User = UltimaBase.Schema.define({
	className: 'User',
	fields: (field) => ({
		firstName: field.string({ required: true }),
		lastName: field.string({ required: true }),
		tags: field.string({ list: true }),
		displayName: field.virtual({
			description: 'The public display name',
			output: (output) => output.string(),
			select: { firstName: true, lastName: true },
			resolve: ({ item }) => `${item.firstName} ${item.lastName}`,
		}),
	}),
})
```

`select` is a flat persisted dependency selection. Core adds `id` even when it
is omitted. It accepts persisted scalar and object fields plus pointer identity;
relations, other virtual fields, nested selection, and inclusion are invalid.
The resolver's readonly `item` is typed to exactly those selected persisted
values plus `id`.

An empty object and an all-`false` object use exclusion semantics, as in a normal
selection. Prefer `select: { id: true }` when identity is the only dependency so
the declaration communicates that intent directly.

## Output shapes

The output descriptor controls the complete returned value. Nullability applies
to the value or list container; list elements remain non-null:

```ts
const Profile = UltimaBase.Schema.define({
	className: 'Profile',
	fields: (field) => ({
		firstName: field.string({ required: true }),
		lastName: field.string({ required: true }),
		nickname: field.string(),
		labels: field.string({ list: true }),
		optionalLabel: field.virtual({
			output: (output) => output.string(),
			select: { nickname: true },
			resolve: ({ item }) => item.nickname,
		}),
		publicLabels: field.virtual({
			output: (output) => output.string({ list: true }),
			select: { labels: true },
			resolve: ({ item }) => item.labels ?? [],
		}),
		summary: field.virtual({
			output: (output) =>
				output.object({
					typeName: 'ProfileSummary',
					fields: (output) => ({
						label: output.string(),
						aliases: output.string({ list: true }),
					}),
				}),
			select: { firstName: true, lastName: true },
			resolve: ({ item }) => ({
				label: `${item.firstName} ${item.lastName}`,
				aliases: [item.firstName, item.lastName],
			}),
		}),
	}),
})
```

The generated `ProfileItem` contains only persisted values. `ProfileOutput` and
`ProfileSelect` also contain `optionalLabel`, `publicLabels`, and `summary` with
the exact primitive, nullable, list, and recursive object shapes declared above.
Create, update, nested-write, where, order, migration, and adapter contracts keep
using the persisted shape.

## Request-aware and asynchronous values

Resolvers receive the real immutable `RequestContext` and may return either a
value or a promise of that value:

```ts
const Account = UltimaBase.Schema.define({
	className: 'Account',
	fields: (field) => ({
		email: field.string({ required: true }),
		maskedEmail: field.virtual({
			output: (output) => output.string(),
			select: { email: true },
			resolve: async ({ item, context }) => {
				const canReadEmail = context.source === 'internal-job'
				return canReadEmail ? item.email : item.email.replace(/^[^@]+/, '***')
			},
		}),
	}),
})
```

The output callback is captured exactly once during schema declaration. The
compiled schema retains only immutable output and dependency
metadata; the resolver remains a Core-private binding and is never serialized.

When a query requests a virtual field, Core keeps that logical selection for
Access and result shaping while giving the adapter a private union of the
caller-visible persisted fields and the virtual dependencies. Dependency-only
values are removed before database-result behaviors and transports can observe
the record. The resolver receives exactly its own immutable dependency view plus
`id`, even when the caller or another virtual field selects more stored values.

Collection resolvers run in deterministic item and declaration order through
fixed batches of at most 16 callbacks. Core waits for a started batch to settle,
reports its lowest-ordinal failure, and starts no later batch after failure or
cancellation. Returned values are structurally snapshotted through `output`.
Mutation resolvers complete before commit, so rejection or invalid output rolls
back the automatic transaction. Virtual fields selected below eager pointers or
relations use the same operation-local scheduler after independent target
Access.
