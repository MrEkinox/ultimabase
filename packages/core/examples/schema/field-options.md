# Built-in fields and options

A schema can combine portable field metadata without choosing a database
representation. Database plugins later translate these declarations for their
own adapter. Every inline field declaration is contextually typed, so the
editor suggests both common options and kind-specific options such as
`autoIncrement`, `autoNow`, or `timezone`. Hovering a builder method or option
shows its value semantics, important restrictions, and a focused example.

```ts
import { UltimaBase } from '@ultimabase/core'

export const ProductSchema = UltimaBase.Schema.define({
	className: 'Product',
	fields: (field) => ({
		supportEmail: field.string({
			required: true,
		}),
		externalId: field.uuid({
			indexed: 'unique',
			required: true,
		}),
		sequence: field.bigint({ autoIncrement: true }),
		name: field.string({
			required: true,
		}),
		stock: field.int({ default: 0 }),
		rating: field.float(),
		latitude: field.float(),
		price: field.decimal({
			required: true,
			precision: 12,
			scale: 2,
		}),
		status: field.enum({
			values: ['draft', 'published', 'archived'],
			default: 'draft',
		}),
		availableOn: field.date(),
		dailyCutoff: field.time({ timezone: false }),
		publishedAt: field.dateTime({ autoNow: true }),
		tags: field.string({ list: true, default: [] }),
		metadata: field.json({ default: {} }),
		attachment: field.binary(),
		isActive: field.boolean({ default: true }),
	}),
	indexes: [
		// Composite indexes may include developer and framework-owned fields.
		{ fields: ['status', 'createdAt'] },
	],
})
```

`jsonField` accepts an object or array at its root. Nested values may contain
every portable JSON primitive, including `null`; an optional JSON field also
accepts `null` at its root.

`decimalField` uses strings to preserve exact base-10 values. Temporal fields
also use explicit strings: `dateField` stores a calendar day, `timeField` a
time of day, and `dateTimeField` a complete date and time.

Built-in factories protect JavaScript and dynamically assembled declarations
with the same exact structural option contracts exposed to TypeScript. Format,
range, and other application rules belong to the optional
[`@ultimabase/validation-plugin`](../../../validation-plugin/README.md).

Invalid combinations are rejected on the option object itself. Editor
diagnostics identify `values` for an empty enum domain, `onDelete` for a
required pointer using `setNull`, and the temporal field option contract when
`autoNow: true` is combined with `default` or `list: true`. A field with a
`default` is non-null; `nullable: true` beside it keeps `null` acceptable, and
is rejected without a default or beside `required: true` or
`autoIncrement: true`. No extra positional argument is part of any field
factory API.
