# FieldBuilder declarations

`fields(field) { ... }` is the canonical application declaration. Every method
takes the logical name first and the existing field-factory options second:

```ts
import { Schema } from '@ultimabase/core'

export const UserSchema = Schema.define({
	className: 'User',
	fields(field) {
		field.string('username', {
			indexed: 'unique',
			validation: {
				required: true,
				length: { min: 3, max: 32 },
			},
		})
		field.boolean('active', { default: true })
		field.enum('status', {
			values: ['invited', 'active', 'disabled'],
			default: 'invited',
		})
		field.object('profile', {
			fields(field) {
				field.string('displayName', {
					validation: { length: { max: 80 } },
				})
				field.date('birthday')
			},
		})
	},
})
```

The callback runs once during application static compilation. Builder calls
reuse the existing immutable field factories, so the same validation, defaults,
Access, hooks, and metadata apply. The embedded builder intentionally has no
`pointer` or `relation` methods and does not accept `autoIncrement: true`.

Relationship targets remain lazy and exact at the declaration boundary:

```ts
const PostSchema = Schema.define({
	className: 'Post',
	fields(field) {
		field.string('title', { validation: { required: true } })
		field.pointer('author', {
			target: () => UserSchema,
			validation: { required: true },
		})
	},
})
```

Framework and plugin authors can reuse a low-level definition with
`field.add('name', definition)`. Applications should prefer named methods; a
general `field.custom()` is deliberately not part of the application API.

Existing field maps remain migration compatibility during this milestone. The
generated application registry introduced by the following milestone issues
will provide exact model, Query, Access, and hook contracts for builder-declared
schemas without recursive field-map inference.
