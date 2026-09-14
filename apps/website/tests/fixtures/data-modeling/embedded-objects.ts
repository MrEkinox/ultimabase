import { Schema } from '@ultimabase/core'

export const Customer = Schema.define({
	className: 'DocsCustomer',
	fields: (field) => ({
		name: field.string({ required: true }),
		shippingAddress: field.object({
			fields: (embedded) => ({
				city: embedded.string({ required: true }),
				countryCode: embedded.string({ required: true }),
				line1: embedded.string({ required: true }),
				line2: embedded.string(),
			}),
			required: true,
			typeName: 'DocsAddress',
		}),
	}),
})
