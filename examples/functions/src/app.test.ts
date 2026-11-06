// The functions at work from server code and over each transport, each test
// on a new in-memory database holding two books. Its short regions and the
// request files are shown on the page (D-282).
import { asUser, testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { beforeEach, expect, it } from 'vitest'
import { requestFiles } from '../../../scripts/requests.ts'
import { app } from './app.ts'
import { borrowBook, returnBooks, shelf } from './functions.ts'
import { Book } from './models.ts'
import { searchBooks } from './search.ts'

const { check } = requestFiles(
	new URL('requests/', import.meta.url),
	testApplication(app),
)

const ada = { as: asUser({ id: 'ada' }) }
const grace = { as: asUser({ id: 'grace' }) }
let dune = ''

beforeEach(async () => {
	await Book.create({ data: { title: 'Emma' } }, { as: master })
	dune = (await Book.create({ data: { title: 'Dune' } }, { as: master })).id
})

it('runs from server code, as a caller', async () => {
	//#region run
	const loan = await borrowBook.run({ book: dune, days: 14 }, ada)
	expect(loan.book.borrowedBy).toBe('ada')
	expect(loan.dueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
	//#endregion
	//#region run-error
	// A PublicError thrown by `run` reaches the caller.
	await expect(
		borrowBook.run({ book: dune, days: 7 }, grace),
	).rejects.toMatchObject({ code: 'BOOK_BORROWED', message: 'Dune is out.' })
	//#endregion
	//#region run-no-input
	// A function without an input takes only `{ as }`.
	await returnBooks.run(ada)
	const available = await searchBooks.run(
		{ text: 'dune', available: true },
		ada,
	)
	expect(available.map((book) => book.title)).toEqual(['Dune'])
	//#endregion
})

it('checks the access rule, then the input', async () => {
	//#region refused
	// Without `as`, the caller is anonymous.
	await expect(borrowBook.run({ book: dune, days: 14 })).rejects.toMatchObject({
		code: 'ACCESS_DENIED',
		message: 'borrowBook refused.',
		details: { function: 'borrowBook' },
	})
	//#endregion
	//#region invalid
	await expect(
		borrowBook.run({ book: dune, days: 90 }, ada),
	).rejects.toMatchObject({
		code: 'VALIDATION_FAILED',
		message: 'Invalid input.',
		details: { issues: [{ path: ['days'] }] },
	})
	//#endregion
})

it('serves each function over GraphQL', async () => {
	// An object input gives one argument per property.
	await check('search')
	// Renamed by `.with({ graphql: { name } })`.
	await check('give-back')
})

it('serves each function over REST', async () => {
	// A query is a GET, its input in the query string.
	await check('search-rest')
	// A mutation is a POST, its input in the body.
	await check('borrow', { id: dune }, { status: 403 })
})

it('pages a page over each transport, as the model list', async () => {
	//#region paged
	// From server code, `run` returns the page: rows and a count, read when asked.
	const page = await shelf.run(ada)
	expect(await page.count()).toBe(2)
	const [first] = await page.findMany({ take: 1 })
	expect(first?.title).toBe('Dune')
	//#endregion
	// GraphQL serves Book's connection, with Book's page arguments.
	await check('shelf')
	// REST answers as GET /api/books does, with its parameters.
	await check('shelf-rest')
})
