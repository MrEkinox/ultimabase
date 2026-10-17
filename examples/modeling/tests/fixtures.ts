import { Author, Book } from '../src/catalog.ts'
import { Customer } from '../src/customers.ts'

// Test scaffolding: the documented calls stay in the test files' regions.

export const createAuthor = (firstName = 'Ada', lastName = 'Lovelace') =>
	Author.createOne({ data: { firstName, lastName } })

let nextIsbn = 9_780_000_000_000

export const createBook = async (
	authorId: string,
	title: string,
	options: {
		readonly published?: boolean
		readonly tags?: readonly string[]
	} = {},
) => {
	nextIsbn += 1
	return Book.createOne({
		data: {
			author: { connect: authorId },
			genre: 'essay',
			isbn: String(nextIsbn),
			price: '19.90',
			title,
			...options,
		},
		// Tests read the whole created book.
		select: {},
	})
}

export const createCustomer = (name = 'Grace', email = 'grace@example.com') =>
	Customer.createOne({
		data: {
			email,
			name,
			shippingAddress: {
				city: 'Paris',
				countryCode: 'FR',
				line1: '1 Rue Exemple',
			},
		},
		select: { favoriteGenres: true, previousAddresses: true },
	})
