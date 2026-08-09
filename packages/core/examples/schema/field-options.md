# Built-in fields and options

A schema can combine portable field metadata without choosing a database
representation. Database plugins later translate these declarations for their
own adapter. Every inline field declaration is contextually typed, so the
editor suggests both common options and kind-specific options such as
`autoIncrement`, `autoNow`, or `timezone`. Hovering a builder method or option
shows its value semantics, important restrictions, and a focused example.

```ts
import { Schema } from '@ultimabase/core'

export const ProductSchema = Schema.define({
	className: 'Product',
	fields(field) {
		field.uuid('externalId', {
			indexed: 'unique',
			validation: { required: true, version: 7 },
		})
		field.bigint('sequence', { autoIncrement: true })
		field.string('name', {
			validation: { required: true, length: { min: 1, max: 120 } },
		})
		field.int('stock', {
			default: 0,
			validation: { range: { min: 0 } },
		})
		field.float('rating', {
			validation: {
				finite: true,
				range: { min: 0, max: 5 },
			},
		})
		field.decimal('price', {
			validation: {
				required: true,
				precision: 12,
				scale: 2,
				range: { min: '0.00' },
			},
		})
		field.enum('status', {
			typeName: 'ProductStatus',
			values: {
				Draft: 'draft',
				Published: 'published',
				Archived: 'archived',
			},
			default: 'draft',
		})
		field.date('availableOn')
		field.time('dailyCutoff', { timezone: false })
		field.dateTime('publishedAt', { autoNow: true })
		field.string('tags', { list: true, default: [] })
		field.json('metadata', { default: {} })
		field.binary('attachment', {
			validation: { length: { max: 5_000_000 } },
		})
		field.boolean('isActive', { default: true })
	},
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
