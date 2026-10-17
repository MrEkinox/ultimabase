import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Book } from '../src/catalog.ts'
import { Customer } from '../src/customers.ts'
import { Order } from '../src/orders.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { createAuthor, createBook, createCustomer } from './fixtures.ts'

// Each `//#region` below is shown on the Fields documentation page; the
// assertions after it prove what the page says about the result.

it('stores the value of each built-in kind', async () => {
	await testApplication(ultimabase)
	const author = await createAuthor()
	const customer = await createCustomer()

	//#region values
	const book = await Book.createOne({
		data: {
			title: 'The Analytical Engine',
			isbn: '9780000000017',
			author: { connect: author.id },
			price: '19.99',
			genre: 'essay',
			format: 'hardcover',
			tags: ['computing', 'history'],
			pages: 240,
			weightKg: 0.45,
			publishedOn: '2026-07-31',
			cover: new Uint8Array([1, 2, 3]),
			details: { translator: null, editions: [1843, 2026] },
		},
	})
	const order = await Order.createOne({
		data: {
			customer: { connect: customer.id },
			total: '19.99',
			pickupTime: '14:30:00.000',
			placedAt: '2026-07-31T14:30:00.000Z',
		},
	})
	//#endregion values

	// A write returns `{ id }`: read the stored values back.
	const stored = await Book.findOneOrThrow({ where: { id: { eq: book.id } } })
	const storedOrder = await Order.findOneOrThrow({
		where: { id: { eq: order.id } },
	})
	expect(stored).toMatchObject({
		cover: new Uint8Array([1, 2, 3]),
		details: { editions: [1843, 2026], translator: null },
		format: 'hardcover',
		genre: 'essay',
		pages: 240,
		price: '19.99',
		publishedOn: '2026-07-31',
		tags: ['computing', 'history'],
		weightKg: 0.45,
	})
	expect(typeof storedOrder.number).toBe('bigint')
	expect(storedOrder).toMatchObject({
		pickupTime: '14:30:00.000',
		placedAt: '2026-07-31T14:30:00.000Z',
		total: '19.99',
	})
})

it('validates structure, never application rules', async () => {
	await testApplication(ultimabase)
	const author = await createAuthor()
	const book = await createBook(author.id, 'Notes')
	const customer = await createCustomer()
	const invalidValue = { code: 'VALIDATION_ERROR' }

	// Decimal scale, calendar days, time precision and date-time offsets.
	await expect(
		Book.updateOne({ where: { id: book.id }, data: { price: '19.999' } }),
	).rejects.toMatchObject(invalidValue)
	await expect(
		Book.updateOne({
			where: { id: book.id },
			data: { publishedOn: '2026-02-30' },
		}),
	).rejects.toMatchObject(invalidValue)
	await expect(
		Order.createOne({
			data: {
				customer: { connect: customer.id },
				total: '1.00',
				pickupTime: '14:30',
			},
		}),
	).rejects.toMatchObject(invalidValue)
	await expect(
		Order.createOne({
			data: {
				customer: { connect: customer.id },
				total: '1.00',
				placedAt: '2026-07-31T14:30:00.000',
			},
		}),
	).rejects.toMatchObject(invalidValue)

	// Any string is a valid string: formats are application rules.
	const renamed = await Customer.updateOne({
		where: { id: customer.id },
		data: { email: 'not an email' },
		select: { email: true },
	})
	expect(renamed).toMatchObject({ email: 'not an email' })
})

it('shares one enum between fields and keeps a local one per field', async () => {
	await testApplication(ultimabase)
	const author = await createAuthor()

	//#region enums
	const book = await Book.createOne({
		data: {
			title: 'Leaves',
			isbn: '9780000000024',
			author: { connect: author.id },
			price: '12.00',
			genre: 'poetry',
		},
		select: { format: true, genre: true },
	})
	const customer = await Customer.createOne({
		data: {
			name: 'Grace',
			email: 'grace@example.com',
			shippingAddress: {
				line1: '1 Rue Exemple',
				city: 'Paris',
				countryCode: 'FR',
			},
			favoriteGenres: ['poetry', 'essay'],
		},
		select: { favoriteGenres: true },
	})
	//#endregion enums

	expect(book.format).toBe('paperback')
	expect(book.genre).toBe('poetry')
	expect(customer.favoriteGenres).toStrictEqual(['poetry', 'essay'])
})
