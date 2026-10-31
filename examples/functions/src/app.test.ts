// The functions at work from server code and over each transport, each test
// on a new in-memory database holding two books.
import { asUser, testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { beforeEach, expect, it } from 'vitest'
import { app } from './app.ts'
import { borrowBook, returnBooks, searchBooks, shelf } from './functions.ts'
import { Book } from './models.ts'

const running = testApplication(app)

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

	// A PublicError thrown by `run` reaches the caller.
	await expect(
		borrowBook.run({ book: dune, days: 7 }, grace),
	).rejects.toMatchObject({ code: 'BOOK_BORROWED', message: 'Dune is out.' })

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
	await expect(
		borrowBook.run({ book: dune, days: 90 }, ada),
	).rejects.toMatchObject({
		code: 'VALIDATION_FAILED',
		message: 'Invalid input.',
		details: { issues: [{ path: ['days'] }] },
	})
	//#endregion
})

//#region request
// Sends a GraphQL document, as a client without a session does.
async function request(query: string): Promise<unknown> {
	const response = await fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query }),
	})
	return response.json()
}
//#endregion

it('serves each function over GraphQL', async () => {
	//#region graphql
	// An object input gives one argument per property.
	expect(
		await request('{ searchBooks(text: "dune", available: true) { title } }'),
	).toEqual({ data: { searchBooks: [{ title: 'Dune' }] } })
	// Renamed by `.with({ graphql: { name } })`.
	expect(await request('mutation { giveBack }')).toMatchObject({
		errors: [
			{
				message: 'returnBooks refused.',
				extensions: { code: 'ACCESS_DENIED' },
			},
		],
	})
	//#endregion
})

it('serves each function over REST', async () => {
	//#region rest
	// A query is a GET, its input in the query string.
	const found = await fetch(
		`${running.url}/api/functions/searchBooks?text=dune&available=true`,
	)
	expect(await found.json()).toMatchObject([{ title: 'Dune' }])

	// A mutation is a POST, its input in the body.
	const borrowed = await fetch(`${running.url}/api/functions/borrowBook`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ book: dune, days: 14 }),
	})
	expect(borrowed.status).toBe(403)
	expect(await borrowed.json()).toMatchObject({
		code: 'ACCESS_DENIED',
		message: 'borrowBook refused.',
	})
	//#endregion
})

it('pages a page over each transport, as the model list', async () => {
	//#region paged
	// From server code, `run` returns the page: rows and a count, read when asked.
	const page = await shelf.run(ada)
	expect(await page.count()).toBe(2)
	const [first] = await page.findMany({ take: 1 })
	expect(first?.title).toBe('Dune')

	// GraphQL serves Book's connection, with Book's page arguments.
	expect(
		await request(
			'{ shelf(first: 1) { edges { node { title } } totalCount } }',
		),
	).toEqual({
		data: { shelf: { edges: [{ node: { title: 'Dune' } }], totalCount: 2 } },
	})

	// REST answers as GET /api/books does, with its parameters.
	const listed = await fetch(
		`${running.url}/api/functions/shelf?first=1&totalCount=true`,
	)
	expect(await listed.json()).toMatchObject({
		edges: [{ node: { title: 'Dune' } }],
		pageInfo: { hasNextPage: true },
		totalCount: 2,
	})
	//#endregion
})
