// Virtual fields in the contract (D-151): the adapter reads the fields a
// virtual needs though the caller selects none of them, and the rows a
// virtual returns are read again by id with their relations and counts.
import type { Adapter, Identity } from 'ultimabase'
import { allow, defineModel, master } from 'ultimabase'
import { beforeEach, describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M: { readonly as: Identity } = { as: master }

type Result<T> =
	| { readonly value: T }
	| { readonly issues: readonly { readonly message: string }[] }

/** A Standard Schema of what `check` accepts, as zod would type it. */
function schema<T>(check: (value: unknown) => value is T): {
	readonly '~standard': {
		readonly version: 1
		readonly vendor: string
		readonly validate: (value: unknown) => Result<T>
		readonly types?: { readonly input: T; readonly output: T }
	}
} {
	const validate = (value: unknown): Result<T> =>
		check(value) ? { value } : { issues: [{ message: 'Invalid.' }] }
	return { '~standard': { version: 1, vendor: 'testing', validate } }
}

const text = schema((value): value is string => typeof value === 'string')
const width = schema((value): value is { readonly width: number } =>
	Number.isInteger(Reflect.get(Object(value), 'width')),
)
const first = schema((value): value is { readonly first: number } =>
	Number.isInteger(Reflect.get(Object(value), 'first')),
)

const Shelf = defineModel({
	name: 'Shelf',
	fields: (f) => ({
		name: f.string(),
		books: f.many(() => Book),
		label: f.virtual(text, { needs: ['name'] }),
		padded: f.virtual(text, { input: width, needs: ['name'] }),
		latest: f.virtual(() => [Book], { input: first }),
	}),
}).with({
	access: allow.public,
	virtuals: {
		label: { run: ({ record }) => record.name.toUpperCase() },
		padded: {
			run: ({ input, record }) => record.name.padEnd(input.width, '.'),
		},
		latest: {
			runMany: async ({ input, records }) => {
				const ids = records.map((record) => record.id)
				const books = await Book.findMany(
					{
						where: { shelf: { is: { id: { in: ids } } } },
						orderBy: { title: 'desc' },
						include: { shelf: { select: { id: true } } },
					},
					M,
				)
				return records.map((record) =>
					books
						.filter((book) => book.shelf?.id === record.id)
						.slice(0, input.first),
				)
			},
		},
	},
})

const Book = defineModel({
	name: 'Book',
	fields: (f) => ({
		title: f.string(),
		shelf: f.one(() => Shelf, { optional: true }),
		tags: f.many(() => Tag),
	}),
}).with({ access: allow.public })

const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({ name: f.string(), books: f.many(() => Book) }),
}).with({ access: allow.public })

export function virtuals(create: () => Adapter): void {
	describe('virtual fields', () => {
		started(create, [Shelf, Book, Tag])

		beforeEach(async () => {
			await Shelf.create(
				{
					data: {
						name: 'oak',
						books: {
							create: [
								{ title: 'A', tags: { create: [{ name: 'old' }] } },
								{ title: 'B' },
								{ title: 'C', tags: { create: [{ name: 'new' }] } },
							],
						},
					},
				},
				M,
			)
			await Shelf.create({ data: { name: 'elm' } }, M)
		})

		it('reads the fields it needs, which the row leaves out', async () => {
			const rows = await Shelf.findMany(
				{
					orderBy: { name: 'asc' },
					select: { label: true, padded: { width: 5 } },
				},
				M,
			)
			expect(rows).toStrictEqual([
				{ label: 'ELM', padded: 'elm..' },
				{ label: 'OAK', padded: 'oak..' },
			])
		})

		it('is in the default row without an input', async () => {
			const row = await Shelf.findFirst({ where: { name: 'oak' } }, M)
			expect(row?.label).toBe('OAK')
			expect(row && 'padded' in row).toBe(false)
		})

		it('reads the rows it returns with their relations', async () => {
			const rows = await Shelf.findMany(
				{
					orderBy: { name: 'asc' },
					select: {
						name: true,
						latest: {
							first: 2,
							select: {
								title: true,
								shelf: { select: { label: true } },
								tags: { select: { name: true } },
								_count: { select: { tags: true } },
							},
						},
					},
				},
				M,
			)
			expect(rows).toStrictEqual([
				{ name: 'elm', latest: [] },
				{
					name: 'oak',
					latest: [
						{
							title: 'C',
							shelf: { label: 'OAK' },
							tags: [{ name: 'new' }],
							_count: { tags: 1 },
						},
						{
							title: 'B',
							shelf: { label: 'OAK' },
							tags: [],
							_count: { tags: 0 },
						},
					],
				},
			])
		})

		it('is read under an included relation', async () => {
			const book = await Book.findFirst(
				{
					where: { title: 'A' },
					include: { shelf: { include: { padded: { width: 4 } } } },
				},
				M,
			)
			expect(book?.shelf?.label).toBe('OAK')
			expect(book?.shelf?.padded).toBe('oak.')
		})
	})
}
