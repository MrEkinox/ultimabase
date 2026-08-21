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
	fields: (field) => ({
		externalId: field.uuid({
			indexed: 'unique',
			required: true,
			validation: { version: 7 },
		}),
		sequence: field.bigint({ autoIncrement: true }),
		name: field.string({
			required: true,
			validation: { length: { min: 1, max: 120 } },
		}),
		stock: field.int({
			default: 0,
			validation: { range: { min: 0 } },
		}),
		rating: field.float({
			validation: {
				finite: true,
				range: { min: 0, max: 5 },
			},
		}),
		price: field.decimal({
			required: true,
			precision: 12,
			scale: 2,
			validation: {
				range: { min: '0.00' },
			},
		}),
		status: field.enum({
			typeName: 'ProductStatus',
			values: {
				Draft: 'draft',
				Published: 'published',
				Archived: 'archived',
			},
			default: 'draft',
		}),
		availableOn: field.date(),
		dailyCutoff: field.time({ timezone: false }),
		publishedAt: field.dateTime({ autoNow: true }),
		tags: field.string({ list: true, default: [] }),
		metadata: field.json({ default: {} }),
		attachment: field.binary({
			validation: { length: { max: 5000000 } },
		}),
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
with the same exact option contracts exposed to TypeScript. Unknown root and
nested validation keys report the field kind and complete path. For example,
`stringField({ validation: { requred: true } })` throws
`Unknown string field option: validation.requred` instead of retaining the
misspelled metadata. Plugin fields retain their own option contracts and
normalizers; Core does not apply a built-in allowlist to plugin-owned keys.

Invalid combinations are rejected on the option object itself. Editor
diagnostics identify `values` for an empty enum domain, `onDelete` for a
required pointer using `setNull`, and the temporal field option contract when
`autoNow: true` is combined with `default` or `list: true`. No extra positional
argument is part of any field factory API.
