import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Author, Book } from '../src/catalog.ts'
import { Customer } from '../src/customers.ts'
import { Order } from '../src/orders.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { createAuthor, createBook, createCustomer } from './fixtures.ts'

// Each `//#region` below is shown on the Relationships documentation page;
// the assertions after it prove what the page says about the result.

it('reads the target of a pointer through its schema', async () => {
	await testApplication(ultimabase)
	const ada = await createAuthor('Ada', 'Lovelace')
	const { id } = await createBook(ada.id, 'Notes')

	//#region read-pointer
	const book = await Book.findOneOrThrow({
		where: { id: { eq: id } },
		select: { author: true },
	})
	const author = await Author.findOne({
		where: { id: { eq: book.author.id } },
		select: { lastName: true },
	})
	//#endregion read-pointer

	expect(book.author.equals(Author.pointer(ada.id))).toBe(true)
	expect(book.author.toJSON()).toStrictEqual({
		className: 'Author',
		id: ada.id,
		type: 'pointer',
	})
	expect(author).toStrictEqual({ id: ada.id, lastName: 'Lovelace' })

	//#region include-pointer
	const withAuthor = await Book.findOneOrThrow({
		where: { id: { eq: id } },
		select: { title: true },
		include: { author: { select: { lastName: true } } },
	})
	//#endregion include-pointer

	expect(withAuthor).toStrictEqual({
		author: { id: ada.id, lastName: 'Lovelace' },
		id,
		title: 'Notes',
	})
})

it('restricts or cascades the deletion of a pointer target', async () => {
	await testApplication(ultimabase)
	const ada = await createAuthor()
	await createBook(ada.id, 'Notes')
	const grace = await createCustomer()
	await Order.createOne({
		data: { customer: { connect: grace.id }, total: '9.90' },
	})

	//#region delete-target
	// `restrict` (the default): an author with books cannot be deleted.
	const refused = await Author.deleteOne({ where: { id: ada.id } }).catch(
		(error: unknown) => error,
	)

	// `cascade`: deleting a customer deletes its orders too.
	await Customer.deleteOne({ where: { id: grace.id } })
	//#endregion delete-target

	expect(refused).toMatchObject({
		code: 'REFERENCE_VIOLATION',
		publicDetails: { schema: 'Author' },
	})
	expect(await Author.exists({ where: { id: { eq: ada.id } } })).toBe(true)
	expect(await Order.count()).toBe(0)
})

it('reads an inverse relation from the pointers that target the row', async () => {
	await testApplication(ultimabase)
	const ada = await createAuthor()
	await createBook(ada.id, 'Notes')
	await createBook(ada.id, 'Sketches')

	//#region include-inverse
	const author = await Author.findOneOrThrow({
		where: { id: { eq: ada.id } },
		select: { lastName: true },
		include: { books: { select: { title: true }, orderBy: { title: 'asc' } } },
	})
	//#endregion include-inverse

	expect(author.books.map(({ title }) => title)).toStrictEqual([
		'Notes',
		'Sketches',
	])
})

it('changes and reads a filtered relation', async () => {
	await testApplication(ultimabase)
	const ada = await createAuthor()
	const notes = await createBook(ada.id, 'Notes', { published: true })
	const draft = await createBook(ada.id, 'Draft')
	const customer = await createCustomer()

	//#region connect-wishlist
	const updated = await Customer.updateOne({
		where: { id: customer.id },
		data: { wishlist: { connect: [notes.id, draft.id] } },
		include: { wishlist: { select: { title: true } } },
	})
	//#endregion connect-wishlist

	// The declared filter hides the unpublished book from every read.
	expect(updated?.wishlist.map(({ title }) => title)).toStrictEqual(['Notes'])

	//#region relation-filter
	const wishesNotes = await Customer.exists({
		where: {
			id: { eq: customer.id },
			wishlist: { some: { id: { eq: notes.id } } },
		},
	})
	//#endregion relation-filter

	expect(wishesNotes).toBe(true)
	expect(
		await Customer.exists({
			where: {
				id: { eq: customer.id },
				wishlist: { some: { id: { eq: draft.id } } },
			},
		}),
	).toBe(false)

	// `set: []` also removes the members the filter hides.
	await Customer.updateOne({
		where: { id: customer.id },
		data: { wishlist: { set: [] } },
	})
	await Book.updateOne({ where: { id: draft.id }, data: { published: true } })
	const emptied = await Customer.findOneOrThrow({
		where: { id: { eq: customer.id } },
		include: { wishlist: { select: { title: true } } },
	})
	expect(emptied.wishlist).toStrictEqual([])
})
