// `undefined` means "no condition" in a `where` (D-19) and "unchanged" in
// `data` (D-84), as in Prisma, so optional inputs pass through. `tsc` fails if
// one does not hold.
import { Book } from './book.ts'

declare const input: {
	readonly id: string
	readonly title?: string | undefined
	readonly pages?: number | null | undefined
}
declare const search: {
	readonly title?: string | undefined
	readonly minPages?: number | undefined
	readonly take?: number | undefined
}

const { id, ...data } = input
await Book.update({ where: { id }, data })
await Book.findMany({
	where: { title: { contains: search.title }, pages: { gte: search.minPages } },
	orderBy: { title: search.take === undefined ? undefined : 'asc' },
	take: search.take,
})
await Book.create({
	data: { title: 'Dune', pages: undefined, author: { connect: { id: 'a1' } } },
})

await Book.update({
	where: { id },
	// @ts-expect-error: `undefined` does not make a wrong value right.
	data: { pages: 'many' },
})
await Book.create({
	// @ts-expect-error: a required field cannot be left `undefined`.
	data: { title: undefined, author: { connect: { id: 'a1' } } },
})
