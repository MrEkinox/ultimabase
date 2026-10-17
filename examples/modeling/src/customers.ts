import { addressFields } from './address.ts'
import { App } from './app.ts'
import { Book } from './catalog.ts'
import { Genre } from './genre.ts'
import { loyaltyService } from './loyalty.ts'

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
			output: (output) => output.string(),
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
