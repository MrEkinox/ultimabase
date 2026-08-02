# Built-in fields and options

A schema can combine portable field metadata without choosing a database
representation. Database plugins later translate these declarations for their
own adapter. Every inline field declaration is contextually typed, so the
editor suggests both common options and kind-specific options such as
`autoIncrement`, `autoNow`, or `timezone`. Hovering a factory or option shows
its value semantics, important restrictions, and a focused example.

```ts
import {
	bigintField,
	binaryField,
	booleanField,
	dateField,
	dateTimeField,
	decimalField,
	defineSchema,
	enumField,
	floatField,
	intField,
	jsonField,
	stringField,
	timeField,
	uuidField,
} from '@ultimabase/schema'

export const ProductSchema = defineSchema({
	className: 'Product',
	fields: {
		externalId: uuidField({
			indexed: 'unique',
			validation: { required: true, version: 7 },
		}),
		sequence: bigintField({ autoIncrement: true }),
		name: stringField({
			validation: { required: true, length: { min: 1, max: 120 } },
		}),
		stock: intField({
			default: 0,
			validation: { range: { min: 0 } },
		}),
		rating: floatField({
			validation: {
				nullable: true,
				finite: true,
				range: { min: 0, max: 5 },
			},
		}),
		price: decimalField({
			validation: {
				required: true,
				precision: 12,
				scale: 2,
				range: { min: '0.00' },
			},
		}),
		status: enumField({
			typeName: 'ProductStatus',
			values: {
				Draft: 'draft',
				Published: 'published',
				Archived: 'archived',
			},
			default: 'draft',
		}),
		availableOn: dateField(),
		dailyCutoff: timeField({ timezone: false }),
		publishedAt: dateTimeField({ autoNow: true }),
		tags: stringField({ list: true, default: [] }),
		metadata: jsonField({ default: {} }),
		attachment: binaryField({
			validation: { nullable: true, length: { max: 5_000_000 } },
		}),
		isActive: booleanField({ default: true }),
	},
	indexes: [
		// Composite indexes may include developer and framework-owned fields.
		{ fields: ['status', 'createdAt'] },
	],
})
```

`jsonField` accepts an object or array at its root. Nested values may contain
every portable JSON primitive, including `null`; root `null` requires
`validation.nullable: true` so field nullability remains explicit.

`decimalField` uses strings to preserve exact base-10 values. Temporal fields
also use explicit strings: `dateField` stores a calendar day, `timeField` a
time of day, and `dateTimeField` a complete date and time.
