# Operation-oriented Access

Schema Access groups every decision under the operation it protects. A direct
boolean or callback is the concise `allow` form. Use the detailed form when an
operation also needs a private row restriction or a materialized item decision:

```ts
import { Schema, booleanField, stringField } from '@ultimabase/core'

const Post = Schema.define({
	className: 'Post',
	access: {
		read: {
			allow: { one: true, many: true, count: false, exists: true },
			where: { published: { eq: true } },
		},
		create: ({ context }) => context.access.mode === 'master',
		update: {
			where: ({ where }) => where.eq('locked', false),
			item: ({ originalItem, item }) => item.authorId === originalItem.authorId,
		},
		delete: {
			allow: ({ context }) => context.access.mode === 'master',
			item: ({ originalItem }) => originalItem.locked === false,
		},
	},
	fields: {
		authorId: stringField({
			access: {
				update: ({ originalValue, value }) => value === originalValue,
			},
			validation: { required: true },
		}),
		locked: booleanField({ default: false }),
		published: booleanField({ default: false }),
		secret: stringField({
			access: {
				read: { output: false, filter: false, order: false },
			},
		}),
	},
})
```

A static `where` object is the canonical representation. Its callback form may
return the supplied immutable builder, an object, or `undefined` when that
contribution adds no restriction. Complete denial belongs to `allow: false`.

Field `read: true` and `read: false` apply to output, filtering, and ordering
together. When those channels differ, all three properties are required so an
omitted indirect disclosure cannot inherit a broader fallback.
