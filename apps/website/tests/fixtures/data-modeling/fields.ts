import { Schema } from '@ultimabase/core'

export const Product = Schema.define({
	className: 'DocsProduct',
	fields: (field) => ({
		displayPrice: field.virtual({
			output: (output) => output.string({ nullable: false }),
			resolve: ({ item }) => `${item.price} EUR`,
			select: { price: true },
		}),
		price: field.decimal({ precision: 12, required: true, scale: 2 }),
		status: field.enum({
			default: 'draft',
			typeName: 'DocsProductStatus',
			values: ['draft', 'published'],
		}),
		tags: field.string({ default: [], list: true }),
	}),
})
