# Objects and lists

Object fields compose existing field declarations. Reusing one embedded builder
callback keeps nested contracts consistent without sharing mutable schema state.
Inline `field.object` options remain contextually typed, so editors suggest
`fields`, `typeName`, `list`, `validation`, defaults, and indexes
without widening the nested field map.

Embedded objects contain stored value fields only. Pointers and relations need
top-level schema identity, so declare them directly on the schema or model
relationship attributes through an explicit relationship schema. Auto-incremented
integer fields also remain top-level because a database sequence cannot generate
one property inside an embedded value.

```ts
import { Schema, type EmbeddedFieldBuilder } from '@ultimabase/core'

const addressFields = (field: EmbeddedFieldBuilder) => ({
	line1: field.string({ validation: { required: true } }),
	line2: field.string(),
	city: field.string({ validation: { required: true } }),
	internalRoutingCode: field.string(),
	postalCode: field.string({ validation: { required: true } }),
	countryCode: field.string({
		validation: {
			required: true,
			length: { min: 2, max: 2 },
			match: /^[A-Z]{2}$/u,
		},
	}),
})

export const CustomerSchema = Schema.define({
	className: 'Customer',
	fields: (field) => ({
		name: field.string({ validation: { required: true } }),
		shippingAddress: field.object({
			typeName: 'Address',
			fields: addressFields,
			validation: { required: true },
		}),
		previousAddresses: field.object({
			typeName: 'PreviousAddress',
			fields: addressFields,
			list: true,
		}),
		preferences: field.object({
			typeName: 'CustomerPreferences',
			fields: (field) => ({
				locale: field.string({ default: 'en' }),
				favoriteTags: field.string({ list: true }),
			}),
		}),
		scores: field.float({ list: true }),
		scoreMatrix: field.json(),
	}),
})
```

`previousAddresses` is a list of structured objects. `scores` is a typed
one-dimensional number list. A multidimensional `scoreMatrix` uses JSON so its
nested array shape is explicit. When installed, field output policy is applied to every concrete object occurrence,
so `internalRoutingCode` is structurally omitted from both `shippingAddress`
and every `previousAddresses` entry without removing any address from the list.
