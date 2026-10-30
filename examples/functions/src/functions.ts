// The library's operations: a client borrows and returns a book only
// through them.
//#region borrow
import { graphql } from '@ultimabase/graphql'
import {
	PublicError,
	allow,
	defineFunction,
	defineType,
	master,
} from 'ultimabase'
import type { Caller } from 'ultimabase'
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
	run: async ({ input, caller }) => {
		const book = await Book.findUniqueOrThrow(
			{ where: { id: input.book } },
			{ as: caller },
		)
		if (book.borrowedBy !== null) {
			throw new PublicError('BOOK_BORROWED', `${book.title} is out.`)
		}
		// Book is read-only for clients: the function writes as the server.
		const lent = await Book.update(
			{ where: { id: book.id }, data: { borrowedBy: userOf(caller) } },
			{ as: master },
		)
		const due = new Date(Date.now() + input.days * 86_400_000)
		return { book: lent, dueOn: due.toISOString().slice(0, 10) }
	},
}).with({ access: ({ caller }) => caller.kind === 'user' })
//#endregion

/** The caller's user id; a function's access rule let only users in. */
function userOf(caller: Caller): string {
	if (caller.kind !== 'user') throw new Error('A user is required.')
	return caller.user.id
}

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
	run: async ({ caller }) => {
		const borrowedBy = userOf(caller)
		await Book.updateMany(
			{ where: { borrowedBy }, data: { borrowedBy: null } },
			{ as: master },
		)
	},
}).with({
	access: ({ caller }) => caller.kind === 'user',
	// Named `giveBack` in GraphQL; REST keeps `returnBooks`.
	graphql: { name: 'giveBack' },
})
//#endregion
