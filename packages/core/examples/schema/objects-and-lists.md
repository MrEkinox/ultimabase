# Objects and lists

Object fields compose existing field declarations. Reusing one embedded builder
callback keeps nested contracts consistent without sharing mutable schema state.
Inline `field.object` options remain contextually typed, so editors suggest
`fields`, `typeName`, `list`, `validation`, defaults, indexes, and extensions
without widening the nested field map.

Embedded objects contain stored value fields only. Pointers and relations need
top-level schema identity, so declare them directly on the schema or model
relationship attributes through an explicit relationship schema. Auto-incremented
integer fields also remain top-level because a database sequence cannot generate
one property inside an embedded value.

```ts
import { Schema, type EmbeddedFieldBuilder } from '@ultimabase/core'

const addressFields = (field: EmbeddedFieldBuilder): void => {
	field.string('line1', { validation: { required: true } })
	field.string('line2')
	field.string('city', { validation: { required: true } })
	field.string('internalRoutingCode', { access: { read: false } })
	field.string('postalCode', { validation: { required: true } })
	field.string('countryCode', {
		validation: {
			required: true,
			length: { min: 2, max: 2 },
			match: /^[A-Z]{2}$/u,
		},
	})
}

export const CustomerSchema = Schema.define({
	className: 'Customer',
	fields(field) {
		field.string('name', { validation: { required: true } })
		field.object('shippingAddress', {
			typeName: 'Address',
			fields: addressFields,
			validation: { required: true },
		})
		field.object('previousAddresses', {
			typeName: 'PreviousAddress',
			fields: addressFields,
			list: true,
		})
		field.object('preferences', {
			typeName: 'CustomerPreferences',
			fields(field) {
				field.string('locale', { default: 'en' })
				field.string('favoriteTags', { list: true })
			},
		})
		// A true tuple declares one list wrapper for each tuple item.
		field.float('scoreMatrix', { list: [true, true] })
	},
})
```

`previousAddresses` is a list of structured objects. `scoreMatrix` is a
two-dimensional list, and additional `true` entries can express deeper finite
dimensions. Field output Access is applied to every concrete object occurrence,
so `internalRoutingCode` is structurally omitted from both `shippingAddress`
and every `previousAddresses` entry without removing any address from the list.
