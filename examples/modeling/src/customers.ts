import type { EmbeddedFieldBuilder } from '@ultimabase/core'

import { App } from './app.ts'
import { Book, Genre } from './catalog.ts'
import { loyaltyService } from './loyalty.ts'

//#region address
/** One reusable child shape for every address of a customer. */
const addressFields = (field: EmbeddedFieldBuilder) => ({
	line1: field.string({ required: true }),
	line2: field.string(),
	city: field.string({ required: true }),
	countryCode: field.string({ required: true }),
})
//#endregion address

//#region customer
export const Customer = App.Schema.define({
	className: 'Customer',
	fields: (field) => ({
		name: field.string({ required: true }),
		email: field.string({ required: true, indexed: 'unique' }),
		// Embedded objects belong to the customer: no id, no own lifecycle.
		shippingAddress: field.object({
			fields: addressFields,
			required: true,
			typeName: 'Address',
		}),
		previousAddresses: field.object({
			fields: addressFields,
			list: true,
			default: [],
			typeName: 'PreviousAddress',
		}),
		favoriteGenres: field.enum({ values: Genre, list: true }),
		// Owning side: the customer stores which books it wishes for.
		wishlist: field.relation({ target: () => Book }),
		// One call to the loyalty service resolves every customer of a read.
		loyaltyTier: field.virtual({
			output: (output) => output.string({ nullable: false }),
			select: { email: true },
			resolveMany: ({ items }) =>
				loyaltyService.tiers(items.map(({ email }) => String(email))),
		}),
	}),
}).with({
	// Reads through `wishlist` only show published books.
	relations: { wishlist: { where: { published: { eq: true } } } },
})
//#endregion customer
