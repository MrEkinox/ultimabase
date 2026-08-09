# Operation-oriented Access

Schema Access groups every decision under the operation it protects. A direct
boolean or callback is the concise `allow` form. Use the detailed form when an
operation also needs a private row restriction or a materialized item decision:

```ts
import { Schema } from '@ultimabase/core'

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
	fields(field) {
		field.string('authorId', {
			access: {
				write: {
					fill: true,
					replace: ({ originalValue, value }) => value === originalValue,
					clear: false,
				},
			},
			validation: { required: true },
		})
		field.boolean('locked', { default: false })
		field.boolean('published', { default: false })
		field.string('secret', {
			access: {
				read: { output: false, where: false, orderBy: false },
			},
		})
	},
})
```

A static `where` object is the canonical representation. Its callback form may
return the supplied immutable builder, an object, or `undefined` when that
contribution adds no restriction. Complete denial belongs to `allow: false`.

Field `read: true` and `read: false` apply to output, filtering, and ordering
together. When those channels differ, all three properties are required so an
omitted indirect disclosure cannot inherit a broader fallback.

Field `write: true` and `write: false` apply to every value transition. The
detailed form distinguishes filling an empty field, replacing
a non-null value, and clearing to canonical `null`. Direct `null` and `unset()`
both use the `clear` rule.
