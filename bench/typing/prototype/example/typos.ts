// A misspelled key is refused on its own line, next to valid keys and at any
// depth of a query (exact.ts). `tsc` fails if one is accepted.
import type { Where } from '../query.ts'
import type { modelFields } from '../symbols.ts'
import { Book } from './book.ts'

await Book.findMany({
	where: {
		title: 'x',
		// @ts-expect-error: `titel` is not a field.
		titel: 'x',
		// A scalar filter.
		pages: {
			gt: 10,
			// @ts-expect-error: `gtt` is not an operator.
			gtt: 20,
		},
		// A `Date` filter.
		createdAt: {
			lt: new Date(),
			// @ts-expect-error: `ltt` is not an operator.
			ltt: new Date(),
		},
		// A relation filter, two levels down.
		author: {
			is: {
				books: {
					some: {
						title: 'x',
						// @ts-expect-error: `titel` is not a field of Book.
						titel: 'x',
					},
				},
			},
		},
		// A combinator's array.
		OR: [
			{ title: 'a' },
			{
				title: 'b',
				// @ts-expect-error: `pagez` is not a field.
				pagez: 1,
			},
		],
	},
	orderBy: {
		title: 'asc',
		// @ts-expect-error: `titel` is not a field.
		titel: 'desc',
	},
})

await Book.findMany({
	select: {
		title: true,
		// @ts-expect-error: `titel` is not a field.
		titel: true,
		author: {
			select: {
				name: true,
				// @ts-expect-error: `nam` is not a field of Author.
				nam: true,
			},
			// @ts-expect-error: `take` pages a list, and `author` is a single row.
			take: 1,
		},
	},
})

await Book.findMany({
	include: {
		author: {
			include: {
				books: true,
				// @ts-expect-error: `bookz` is not a relation of Author.
				bookz: true,
			},
		},
	},
})

await Book.findUnique({
	where: {
		id: 'x',
		// @ts-expect-error: `idd` is not a unique key.
		idd: 'y',
	},
})

await Book.create({
	data: {
		title: 'x',
		author: {
			connect: {
				id: 'a',
				// @ts-expect-error: `idd` is not a unique key of Author.
				idd: 'b',
			},
		},
		// @ts-expect-error: `titel` is not a field.
		titel: 'x',
	},
})

await Book.update({
	where: { id: 'x' },
	data: {
		pages: 3,
		// @ts-expect-error: `pagez` is not a field.
		pagez: 3,
	},
})

// A filter typed elsewhere was checked where it was written: it passes, and
// is not walked again (exact.ts).
declare const where: Where<(typeof Book)[typeof modelFields]>
await Book.findMany({ where: { AND: [where], title: 'x' } })
await Book.findMany({
	where: {
		...where,
		// @ts-expect-error: `titel` is not a field, next to a spread filter.
		titel: 'x',
	},
})
