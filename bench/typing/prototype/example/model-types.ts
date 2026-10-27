// A model's types, named from the model (D-74). `tsc` fails if one does not
// hold.
import type {
	ArgsOf,
	CreateDataOf,
	IncludeOf,
	OrderByOf,
	RecordOf,
	SelectOf,
	UpdateDataOf,
	WhereOf,
} from '../index.ts'
import { isAuthenticated, master } from '../index.ts'
import { Book } from './book.ts'

type Equal<A, B> =
	// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- the test needs a free `T`
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false
type Expect<T extends true> = T

// The record type may take the model's name.
type Book = RecordOf<typeof Book>
export function label(book: Book): string {
	return `${book.title} (${book.createdAt.toISOString()})`
}

// A filter built by a helper, passed to a query.
export function titled(title: string): WhereOf<typeof Book> {
	return { title, author: { isNot: null } }
}
const found = await Book.findMany({ where: titled('Dune') }, { as: master })

// Arguments kept in a value, and the record they return.
const withAuthor = {
	include: { author: true },
	orderBy: { createdAt: 'desc' },
} satisfies ArgsOf<typeof Book, 'findMany'>
type BookWithAuthor = RecordOf<typeof Book, typeof withAuthor>
const rows: BookWithAuthor[] = await Book.findMany(withAuthor, { as: master })
export const firstAuthor = rows[0]?.author.name

const titleOnly = { select: { title: true } } satisfies ArgsOf<
	typeof Book,
	'findMany'
>
// A delete without `select` or `include` returns the plain record.
const removeBook = async () =>
	Book.delete({ where: { id: '' } }, { as: master })
export type ModelTypeChecks = [
	Expect<Equal<RecordOf<typeof Book>, Awaited<ReturnType<typeof removeBook>>>>,
	Expect<
		Equal<RecordOf<typeof Book, typeof titleOnly>, { readonly title: string }>
	>,
	Expect<Equal<(typeof found)[number], Book>>,
]

export const parts: [
	IncludeOf<typeof Book>,
	SelectOf<typeof Book>,
	OrderByOf<typeof Book>,
	CreateDataOf<typeof Book>,
	UpdateDataOf<typeof Book>,
] = [
	{ author: true },
	{ title: true },
	{ title: 'asc' },
	{ title: 'Dune', author: { connect: { id: 'a' } } },
	{ pages: 412 },
]

// auth's ready-made rule (D-10).
export const signedIn: boolean = isAuthenticated({ caller: master })

// @ts-expect-error: a misspelt relation in kept arguments.
export const typo = { include: { autor: true } } satisfies ArgsOf<
	typeof Book,
	'findMany'
>
// @ts-expect-error: a misspelt field in a filter helper.
export const badFilter: WhereOf<typeof Book> = { titel: 'Dune' }
// @ts-expect-error: aggregates are not in 0.1 (D-20).
export type NoOperation = ArgsOf<typeof Book, 'aggregate'>
// @ts-expect-error: relations are absent without `include`.
void found[0]?.author
