// Queries across a relation cycle, Author <-> Book, declared in two files
// that import each other, with nothing registered: `where`, `select`,
// `include` and results stay typed at every depth. `tsc` fails if one does
// not hold.
import { Author } from './author.ts'
import { Book } from './book.ts'

type Equal<A, B> =
	// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- the test needs a free `T`
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false
type Expect<T extends true> = T
type IsAny<T> = 0 extends 1 & T ? true : false
type System = {
	readonly id: string
	readonly createdAt: Date
	readonly updatedAt: Date
}
type AuthorRow = System & {
	readonly name: string
	readonly level: 'junior' | 'senior'
}
type BookRow = System & {
	readonly title: string
	readonly pages: number | null
}

// Without `select`, a row has its scalars and no relation, on both sides.
const books = await Book.findMany()
const authors = await Author.findMany()

// Three levels of `select`, there and back: Book -> Author -> Book -> Author.
const deep = await Book.findMany({
	select: {
		title: true,
		author: {
			select: {
				name: true,
				books: {
					where: { pages: { gt: 100 } },
					orderBy: { title: 'asc' },
					take: 3,
					select: { pages: true, author: { select: { level: true } } },
				},
			},
		},
		reviewer: { select: { name: true } },
	},
})

// `include` adds relations to the row; `select` inside `include` narrows them.
const included = await Author.findMany({
	include: {
		books: { include: { author: true, sequels: { select: { title: true } } } },
		favorite: true,
	},
})

// `where` through the cycle, in both directions and three levels deep.
const filtered = await Author.findMany({
	where: {
		books: {
			some: {
				author: { is: { favorite: { is: { pages: { gte: 1 } } } } },
				sequels: { none: { title: { contains: 'x' } } },
			},
		},
		favorite: { isNot: null },
		OR: [{ level: 'senior' }, { name: { startsWith: 'A' } }],
	},
})
const one = await Book.findUnique({
	where: { id: 'b1' },
	select: { author: { select: { favorite: { select: { title: true } } } } },
})

export type RelationChecks = [
	Expect<Equal<(typeof books)[number], BookRow>>,
	Expect<Equal<(typeof authors)[number], AuthorRow>>,
	Expect<
		Equal<
			(typeof deep)[number],
			{
				readonly title: string
				readonly author: {
					readonly name: string
					readonly books: {
						readonly pages: number | null
						readonly author: { readonly level: 'junior' | 'senior' }
					}[]
				}
				readonly reviewer: { readonly name: string } | null
			}
		>
	>,
	Expect<
		Equal<
			(typeof included)[number],
			AuthorRow & {
				readonly books: (BookRow & {
					readonly author: AuthorRow
					readonly sequels: { readonly title: string }[]
				})[]
				readonly favorite: BookRow | null
			}
		>
	>,
	Expect<Equal<(typeof filtered)[number], AuthorRow>>,
	Expect<
		Equal<
			typeof one,
			{
				readonly author: {
					readonly favorite: { readonly title: string } | null
				}
			} | null
		>
	>,
	// Neither model became `any` through the cycle.
	Expect<Equal<IsAny<typeof Book>, false>>,
	Expect<Equal<IsAny<typeof Author>, false>>,
]

// Wrong names and values fail at every depth.
await Book.findMany({
	// @ts-expect-error: `titel` is not a field of Book.
	where: { titel: 'x' },
})
await Book.findMany({
	where: {
		// @ts-expect-error: `nam` is not a field of Author, two levels down.
		author: { is: { books: { some: { author: { is: { nam: 'x' } } } } } },
	},
})
await Author.findMany({
	// @ts-expect-error: `pages` is a number on Book, one level down.
	where: { books: { every: { pages: 'many' } } },
})
await Author.findMany({
	// @ts-expect-error: a to-one relation takes `is`, not `some`.
	where: { favorite: { some: {} } },
})
await Book.findMany({
	select: {
		author: {
			// @ts-expect-error: `email` is not a field of Author, three levels down.
			select: { books: { select: { author: { select: { email: true } } } } },
		},
	},
})
await Author.findMany({
	// @ts-expect-error: `level` is a scalar: it takes no `include`.
	include: { level: true },
})
await Book.findMany({
	// @ts-expect-error: a to-one relation takes no `take`.
	select: { author: { take: 1 } },
})
type DeepBook = (typeof deep)[number]['author']['books'][number]
// @ts-expect-error: `title` was not selected.
export type NotSelected = DeepBook['title']
// @ts-expect-error: relations are not returned without `select` or `include`.
export type NotIncluded = (typeof books)[number]['author']
