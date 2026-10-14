import { Pointer, toJSON } from '@ultimabase/core'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { addBook, describeBook, editBook } from '../src/books.ts'
import { Author, Book } from '../src/catalog.ts'
import { Order } from '../src/orders.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { createAuthor, createBook, createCustomer } from './fixtures.ts'

// Each `//#region` below is shown on the Models documentation page; the
// assertions after it prove what the page says about the result.

it('returns frozen plain data narrowed by the selection', async () => {
	await testApplication(ultimabase)
	const author = await createAuthor()

	//#region results
	const created = await Book.createOne({
		data: {
			title: 'Notes',
			isbn: '9780000000031',
			author: { connect: author.id },
			price: '19.90',
			genre: 'essay',
		},
		select: { title: true },
	})
	const updated = await Book.updateOne({
		where: { id: created.id },
		data: { price: '24.90' },
		select: { title: true, price: true, author: true },
	})
	//#endregion results

	// `id` is always selected; the other fields follow `select`.
	expect(created).toStrictEqual({ id: created.id, title: 'Notes' })
	expect(Object.isFrozen(created)).toBe(true)
	expect(Object.getPrototypeOf(created)).toBe(Object.prototype)
	expect({ ...updated }).toStrictEqual({
		author: Author.pointer(author.id),
		id: created.id,
		price: '24.90',
		title: 'Notes',
	})
	// The earlier result keeps its values; a result has no methods.
	expect(created).not.toHaveProperty('price')
	expect(Reflect.get(created, 'update')).toBeUndefined()
	// A schema is a class that TypeScript and Runtime refuse to construct.
	const schema: unknown = Book
	expect(typeof schema).toBe('function')
	expect(() => {
		if (typeof schema === 'function') Reflect.construct(schema, [{}])
	}).toThrow(/Book is not constructible/u)
})

it('returns a Pointer, or the included row', async () => {
	await testApplication(ultimabase)
	const author = await createAuthor()
	const book = await createBook(author.id, 'Notes')

	const included = await Book.findOneOrThrow({
		where: { id: { eq: book.id } },
		select: { title: true },
		include: { author: { select: { lastName: true } } },
	})

	expect(book.author).toBeInstanceOf(Pointer)
	expect(book.author.equals(Author.pointer(author.id))).toBe(true)
	expect(included.author).toStrictEqual({ id: author.id, lastName: 'Lovelace' })
	expect(Object.isFrozen(included.author)).toBe(true)
})

it('serializes results with toJSON', async () => {
	await testApplication(ultimabase)
	const author = await createAuthor()
	const customer = await createCustomer()
	await Book.createOne({
		data: {
			author: { connect: author.id },
			cover: new Uint8Array([1, 2, 3]),
			genre: 'essay',
			isbn: '9780000000048',
			price: '19.90',
			title: 'Notes',
		},
	})
	await Order.createOne({
		data: { customer: { connect: customer.id }, total: '24.90' },
	})

	//#region to-json
	const book = await Book.findOneOrThrow({
		where: { isbn: { eq: '9780000000048' } },
		select: { author: true, cover: true },
	})
	const order = await Order.findOneOrThrow({
		where: { customer: { eq: customer.id } },
		select: { number: true },
	})

	const json = toJSON({ book, order })
	//#endregion to-json

	expect(json).toStrictEqual({
		book: {
			author: { className: 'Author', id: author.id, type: 'pointer' },
			cover: { data: 'AQID', encoding: 'base64', type: 'binary' },
			id: book.id,
		},
		order: { id: order.id, number: '1' },
	})
	expect(() => JSON.stringify(order)).toThrow(TypeError)
})

it('names results and inputs with the named types', async () => {
	await testApplication(ultimabase)
	const author = await createAuthor()

	const book = await addBook({
		author: { connect: author.id },
		genre: 'fiction',
		isbn: '9780000000055',
		price: '9.90',
		title: 'Tales',
	})
	const renamed = await editBook(
		{ isbn: '9780000000055' },
		{ title: 'More tales' },
	)

	expect(describeBook(book)).toBe('Tales, 9.90 EUR')
	expect(renamed).toMatchObject({ id: book.id, title: 'More tales' })
})
