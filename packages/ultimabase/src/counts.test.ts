// `_count` and sorts through relations (D-134): what the kernel refuses,
// with the path of the faulty input, what writes return, and the types.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import type { ArgsOf } from './index.ts'
import { master } from './index.ts'
import { query } from './engine.ts'
import { Author, Book, Profile, Tag, library } from './test/library.ts'

const M = { as: master }
let app: ReturnType<typeof library>

beforeEach(async () => {
	app = library()
	await app.start()
})
afterEach(async () => app.stop())

/** The `path` the read fails on, or `undefined` when it succeeds. */
const failure = async (model: string, args: unknown): Promise<unknown> => {
	try {
		await query(model, 'findMany', args, M)
		return undefined
	} catch (error) {
		return error instanceof Error && 'path' in error ? error.path : error
	}
}
const books = async (args: object) => failure('Book', args)
const authors = async (args: object) => failure('Author', args)

/** A read whose payload the types check. */
const read = async () =>
	Author.findMany(
		{
			select: {
				name: true,
				_count: { select: { books: true } },
				books: { include: { _count: true } },
			},
		},
		M,
	)

/** Reads the types refuse. */
const refused = async () => {
	const one = { author: true }
	// @ts-expect-error -- a one relation has no count (D-134)
	await Book.findMany({ include: { _count: { select: one } } }, M)
	// @ts-expect-error -- a model without a many relation has no _count
	await Profile.findMany({ include: { _count: true } }, M)
}

describe('_count and sorts through relations', () => {
	it('checks _count', async () => {
		expect(await authors({ include: { _count: 'yes' } })).toBe('include._count')
		expect(await authors({ include: { _count: { where: {} } } })).toBe(
			'include._count.where',
		)
		// A `one` relation has no count.
		expect(
			await authors({ include: { _count: { select: { profile: true } } } }),
		).toBe('include._count.select.profile')
		expect(
			await authors({
				include: { _count: { select: { books: { take: 1 } } } },
			}),
		).toBe('include._count.select.books.take')
		expect(
			await authors({
				select: {
					_count: { select: { books: { where: { title: { in: 'A' } } } } },
				},
			}),
		).toBe('select._count.select.books.where.title.in')
		expect(
			await authors({
				include: { _count: false, books: { include: { _count: true } } },
			}),
		).toBeUndefined()
	})

	it('checks sorts through relations', async () => {
		expect(await books({ orderBy: { author: { ghost: 'asc' } } })).toBe(
			'orderBy.author.ghost',
		)
		expect(await books({ orderBy: { tags: 'asc' } })).toBe('orderBy.tags')
		expect(await books({ orderBy: { tags: { label: 'asc' } } })).toBe(
			'orderBy.tags',
		)
		expect(await books({ orderBy: { tags: { _count: 'up' } } })).toBe(
			'orderBy.tags._count',
		)
		expect(
			await books({ orderBy: [{ author: { profile: { bio: 'desc' } } }] }),
		).toBeUndefined()
		expect(
			await books({ orderBy: { author: { books: { _count: 'asc' } } } }),
		).toBeUndefined()
	})

	it('returns the counts from a write', async () => {
		const ada = await Author.create(
			{
				data: {
					name: 'Ada',
					books: { create: [{ title: 'A' }, { title: 'B' }] },
				},
				include: { _count: true },
			},
			M,
		)
		expect(ada._count).toEqual({ books: 2 })
		const tagged = await Tag.create(
			{ data: { label: 'ts' }, select: { label: true, _count: true } },
			M,
		)
		expect(tagged).toEqual({ label: 'ts', _count: { books: 0 } })
		const renamed = await Author.update(
			{
				where: { id: ada.id },
				data: { name: 'Ada L.' },
				select: { _count: { select: { books: { where: { title: 'A' } } } } },
			},
			M,
		)
		expect(renamed).toEqual({ _count: { books: 1 } })
	})

	it('types _count and the sorts', () => {
		type Find = ArgsOf<typeof Book, 'findMany'>
		expectTypeOf<{
			orderBy: [
				{ author: { profile: { bio: 'asc' } } },
				{ tags: { _count: 'desc' } },
			]
		}>().toExtend<Find>()
		expectTypeOf<{ orderBy: { tags: 'asc' } }>().not.toExtend<Find>()
		expectTypeOf<{ orderBy: { tags: { label: 'asc' } } }>().not.toExtend<Find>()
		expectTypeOf<{
			include: { _count: { select: { tags: { where: { label: 'ts' } } } } }
		}>().toExtend<Find>()
		type Row = Awaited<ReturnType<typeof read>>[number]
		expectTypeOf<Row['_count']>().toEqualTypeOf<{ readonly books: number }>()
		expectTypeOf<Row['books'][number]['_count']>().toEqualTypeOf<{
			readonly tags: number
		}>()
		expectTypeOf(refused).toBeFunction()
	})
})
