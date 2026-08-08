# Objects and lists

Object fields compose existing field declarations. Reusing one field map keeps
nested contracts consistent without sharing mutable schema state.
Inline `objectField` options remain contextually typed, so editors suggest
`fields`, `typeName`, `list`, `validation`, defaults, indexes, and extensions
without widening the nested field map.

Embedded objects contain stored value fields only. Pointers and relations need
top-level schema identity, so declare them directly on the schema or model
relationship attributes through an explicit relationship schema.

```ts
import { Schema, floatField, objectField, stringField } from '@ultimabase/core'

const addressFields = {
	line1: stringField({ validation: { required: true } }),
	line2: stringField(),
	city: stringField({ validation: { required: true } }),
	internalRoutingCode: stringField({ access: { read: false } }),
	postalCode: stringField({ validation: { required: true } }),
	countryCode: stringField({
		validation: {
			required: true,
			length: { min: 2, max: 2 },
			match: /^[A-Z]{2}$/u,
		},
	}),
}

export const CustomerSchema = Schema.define({
	className: 'Customer',
	fields: {
		name: stringField({ validation: { required: true } }),
		shippingAddress: objectField({
			typeName: 'Address',
			fields: addressFields,
			validation: { required: true },
		}),
		previousAddresses: objectField({
			typeName: 'PreviousAddress',
			fields: addressFields,
			list: true,
		}),
		preferences: objectField({
			typeName: 'CustomerPreferences',
			fields: {
				locale: stringField({ default: 'en' }),
				favoriteTags: stringField({ list: true }),
			},
		}),
		// A true tuple declares one list wrapper for each tuple item.
		scoreMatrix: floatField({ list: [true, true] }),
	},
})
```

`previousAddresses` is a list of structured objects. `scoreMatrix` is a
two-dimensional list, and additional `true` entries can express deeper finite
dimensions. Field output Access is applied to every concrete object occurrence,
so `internalRoutingCode` is structurally omitted from both `shippingAddress`
and every `previousAddresses` entry without removing any address from the list.
