# Built-in fields and options

A schema can combine portable field metadata without choosing a database
representation. Database plugins later translate these declarations for their
own adapter. Every inline field declaration is contextually typed, so the
editor suggests both common options and kind-specific options such as
`autoIncrement`, `autoNow`, or `timezone`. Hovering a builder method or option
shows its value semantics, important restrictions, and a focused example.

```ts
import { Schema } from '@ultimabase/core'
import { z } from 'zod'

export const ProductSchema = Schema.define({
	className: 'Product',
	fields: (field) => ({
		supportEmail: field.string({
			required: true,
			validation: z.string().email(),
		}),
		externalId: field.uuid({
			indexed: 'unique',
			required: true,
			validation: z.uuidv7(),
		}),
		sequence: field.bigint({ autoIncrement: true }),
		name: field.string({
			required: true,
			validation: z.string().min(1).max(120),
		}),
		stock: field.int({
			default: 0,
			validation: z.number().int().nonnegative(),
		}),
		rating: field.float({
			validation: z.number().finite().min(0).max(5),
		}),
		latitude: field.float({
			validation: z.number().min(-90).max(90),
		}),
		price: field.decimal({
			required: true,
			precision: 12,
			scale: 2,
			validation: z.string().refine((value) => !value.startsWith('-')),
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
			validation: z
				.instanceof(Uint8Array)
				.refine((value) => value.byteLength <= 5_000_000),
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
with the same exact option contracts exposed to TypeScript. `validation` must
implement Standard Schema V1. Core retains that validator by identity and does
not clone, invoke, or serialize it during declaration. Plugin-defined fields
receive the same validation contract; their direct structural options remain
owned by their snapshot implementation.

Mutation input first crosses Core's type, presence, nullability, and shape
checks. Optional Hooks may then normalize that structurally trusted value, and
one mandatory final Core pass invokes Standard Schema before persistence. This
lets a strict validator describe the stored canonical form without accepting
every raw form handled by `resolveInput`.

`supportEmail` and `latitude` remain ordinary string and float fields. Their
format and range rules do not require derived logical kinds or an UltimaBase
plugin. Community packages may share the validators themselves as ordinary
Standard Schema values.

Invalid combinations are rejected on the option object itself. Editor
diagnostics identify `values` for an empty enum domain, `onDelete` for a
required pointer using `setNull`, and the temporal field option contract when
`autoNow: true` is combined with `default` or `list: true`. No extra positional
argument is part of any field factory API.
