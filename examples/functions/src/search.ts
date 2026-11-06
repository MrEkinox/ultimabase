// The library's search: a query any visitor may call.
//#region search
import { allow, defineFunction } from 'ultimabase'
import { z } from 'zod'
import { Book } from './models.ts'

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
