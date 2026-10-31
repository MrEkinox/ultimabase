// The library's operations: a client borrows and returns a book only
// through them.
//#region borrow
import { isAuthenticated, signedInRun } from '@ultimabase/auth'
import { graphql } from '@ultimabase/graphql'
import {
	PublicError,
	allow,
	defineFunction,
	defineType,
	master,
} from 'ultimabase'
import { z } from 'zod'
import { Book } from './models.ts'

// A named object: a model and data together.
export const Loan = defineType({
	name: 'Loan',
	fields: { book: Book, dueOn: z.iso.date() },
})

export const borrowBook = defineFunction({
	name: 'borrowBook',
	input: z.object({ book: z.string(), days: z.int().min(1).max(30) }),
	output: Loan,
	// `user` is the signed-in caller's record; the access rule lets in no one
	// else.
	run: signedInRun(async ({ input, caller, user }) => {
		const book = await Book.findUniqueOrThrow(
			{ where: { id: input.book } },
			{ as: caller },
		)
		if (book.borrowedBy !== null) {
			throw new PublicError('BOOK_BORROWED', `${book.title} is out.`)
		}
		// Book is read-only for clients: the function writes as the server.
		const lent = await Book.update(
			{ where: { id: book.id }, data: { borrowedBy: user.id } },
			{ as: master },
		)
		const due = new Date(Date.now() + input.days * 86_400_000)
		return { book: lent, dueOn: due.toISOString().slice(0, 10) }
	}),
}).with({ access: isAuthenticated })
//#endregion

//#region search
// A query: served over GraphQL's Query and REST's GET.
export const searchBooks = defineFunction({
	name: 'searchBooks',
	query: true,
	input: z.object({ text: z.string().min(1), available: z.boolean() }),
	output: [Book],
	run: ({ input, caller }) =>
		Book.findMany(
			{
				where: {
					_search: input.text,
					...(input.available ? { borrowedBy: null } : {}),
				},
			},
			{ as: caller },
		),
}).with({ access: allow.public })
//#endregion

//#region return
// No input and no output: GraphQL answers `true`.
export const returnBooks = defineFunction({
	name: 'returnBooks',
	// The transports whose key `.with` sets.
	use: [graphql()],
	run: signedInRun(async ({ user }) => {
		await Book.updateMany(
			{ where: { borrowedBy: user.id }, data: { borrowedBy: null } },
			{ as: master },
		)
	}),
}).with({
	access: isAuthenticated,
	// Named `giveBack` in GraphQL; REST keeps `returnBooks`.
	graphql: { name: 'giveBack' },
})
//#endregion
