# Objects and lists

Object fields compose existing field declarations. Reusing one embedded builder
callback keeps nested contracts consistent without sharing mutable schema state.
The root `field.object` options remain contextually typed, so editors suggest
`fields`, `typeName`, `list`, defaults, and a root index without widening the
nested field map. A recursively embedded `field.object` keeps the same value
shape options but omits `indexed` because only its stored parent has schema
index identity.

Embedded objects contain stored value fields only. Pointers and relations need
top-level schema identity, so declare them directly on the schema or model
relationship attributes through an explicit relationship schema. Portable
indexes and auto-incremented integer fields also remain top-level because one
embedded property has neither schema index identity nor a dedicated database
sequence.

```ts
import { UltimaBase, type EmbeddedFieldBuilder } from '@ultimabase/core'

const addressFields = (field: EmbeddedFieldBuilder) => ({
	line1: field.string({ required: true }),
	line2: field.string(),
	city: field.string({ required: true }),
	internalRoutingCode: field.string(),
	postalCode: field.string({ required: true }),
	countryCode: field.string({
		required: true,
	}),
})

export const CustomerSchema = UltimaBase.Schema.define({
	className: 'Customer',
	fields: (field) => ({
		name: field.string({ required: true }),
		shippingAddress: field.object({
			typeName: 'Address',
			fields: addressFields,
			required: true,
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
