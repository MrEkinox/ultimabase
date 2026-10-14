import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Book } from '../src/catalog.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { createAuthor, createBook } from './fixtures.ts'

// Each `//#region` below is shown on the Schemas documentation page; the
// assertions after it prove what the page says about the result.

it('rejects a duplicate value of a unique field or index', async () => {
	await testApplication(ultimabase)
	const author = await createAuthor()
	const first = await createBook(author.id, 'Notes')

	//#region unique-violation
	const failure = await Book.createOne({
		data: {
			title: 'Another title',
			isbn: first.isbn,
			author: { connect: author.id },
			price: '9.90',
			genre: 'essay',
		},
	}).catch((error: unknown) => error)
	//#endregion unique-violation

	// The public details name the schema and the fields, never the values.
	expect(failure).toMatchObject({
		code: 'UNIQUE_VIOLATION',
		publicDetails: { fields: ['isbn'], schema: 'Book' },
	})
	expect(JSON.stringify(failure)).not.toContain(first.isbn)

	// The same title is refused for the same author only.
	await expect(createBook(author.id, 'Notes')).rejects.toMatchObject({
		code: 'UNIQUE_VIOLATION',
	})
	const other = await createAuthor('Grace', 'Hopper')
	expect(await createBook(other.id, 'Notes')).toMatchObject({ title: 'Notes' })
})

it('targets one row by a unique field or a complete unique index', async () => {
	await testApplication(ultimabase)
	const author = await createAuthor()
	const book = await createBook(author.id, 'Notes')

	//#region unique-targets
	const byIsbn = await Book.updateOne({
		where: { isbn: book.isbn },
		data: { pages: 120 },
	})
	const byIndex = await Book.updateOne({
		where: { author: author.id, title: 'Notes' },
		data: { published: true },
	})
	//#endregion unique-targets

	expect(byIsbn).toMatchObject({ id: book.id, pages: 120 })
	expect(byIndex).toMatchObject({ id: book.id, pages: 120, published: true })
})

it('generates the system fields', async () => {
	await testApplication(ultimabase)
	const author = await createAuthor()
	const book = await createBook(author.id, 'Notes')

	const updated = await Book.updateOne({
		where: { id: book.id },
		data: { pages: 10 },
	})

	expect(book.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-7/u)
	expect(book.createdAt).toBe(book.updatedAt)
	expect(updated?.createdAt).toBe(book.createdAt)
	expect(Date.parse(updated?.updatedAt ?? '')).toBeGreaterThanOrEqual(
		Date.parse(book.updatedAt),
	)
})
