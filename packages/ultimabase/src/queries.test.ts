// Queries the kernel refuses, each with the path of the faulty input, and the
// optional relations and defaults the library models do not have.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import type { ArgsOf } from './index.ts'
import { defineApp, defineModel, master, memory } from './index.ts'
import { query, type Operation } from './engine.ts'
import type { Book } from './test/library.ts'
import { library } from './test/library.ts'

const as = { as: master }
let app: { readonly stop: () => Promise<void> }

afterEach(async () => {
	await app.stop()
})

/** The `path` the query fails on, or `undefined` when it succeeds. */
const failure = async (
	model: string,
	operation: Operation,
	args: unknown,
	options: unknown = as,
): Promise<unknown> => {
	try {
		await query(model, operation, args, options)
		return undefined
	} catch (error) {
		return error instanceof Error && 'path' in error ? error.path : error
	}
}

const books = async (args: object): Promise<unknown> =>
	failure('Book', 'findMany', args)
const bookWhere = async (where: unknown): Promise<unknown> =>
	failure('Book', 'findMany', { where })
const authors = async (args: object): Promise<unknown> =>
	failure('Author', 'findMany', args)

describe('on the library', () => {
	beforeEach(async () => {
		const started = library()
		await started.start()
		app = started
	})

	it('checks the options and the arguments', async () => {
		expect(await query('Book', 'count', {}, {})).toBe(0)
		expect(await failure('Book', 'count', {}, { as: { kind: 'robot' } })).toBe(
			'options.as',
		)
		expect(await failure('Book', 'count', {}, { asx: master })).toBe(
			'options.asx',
		)
		expect(await failure('Book', 'count', 3)).toBe('args')
		expect(await failure('Book', 'count', { ghost: 1 })).toBe('ghost')
		expect(await failure('Book', 'findUnique', {})).toBe('where')
	})

	it('checks where', async () => {
		expect(await bookWhere(3)).toBe('where')
		expect(await bookWhere({ title: { in: 'A' } })).toBe('where.title.in')
		expect(await bookWhere({ title: { contains: 3 } })).toBe(
			'where.title.contains',
		)
		expect(await bookWhere({ author: { some: {} } })).toBe('where.author.some')
		expect(await bookWhere({ OR: {} })).toBe('where.OR')
		expect(await bookWhere({ tags: { some: null } })).toBe('where.tags.some')
		expect(
			await failure('Author', 'findMany', { where: { level: 'expert' } }),
		).toBe('where.level')
		// An empty condition does not filter.
		expect(await bookWhere({ title: {}, author: {} })).toBeUndefined()
		expect(await bookWhere({ author: { is: null } })).toBeUndefined()
	})

	it('checks order, pages and cursors', async () => {
		expect(await books({ take: 1.5 })).toBe('take')
		expect(await books({ skip: -1 })).toBe('skip')
		// Beyond a safe integer a database would fail, or count wrong.
		expect(await books({ take: 2 ** 53 })).toBe('take')
		expect(await books({ skip: 1e300 })).toBe('skip')
		expect(await books({ orderBy: { author: 'asc' } })).toBe('orderBy.author')
		expect(await books({ orderBy: { ghost: 'asc' } })).toBe('orderBy.ghost')
		// A json value has no order alike on every adapter (D-94).
		expect(await books({ orderBy: { meta: 'asc' } })).toBe('orderBy.meta')
		expect(await books({ orderBy: [{ title: 'up' }] })).toBe('orderBy.0.title')
		// Only an optional field takes where its nulls sort (D-149).
		expect(await books({ orderBy: { title: { sort: 'asc' } } })).toBe(
			'orderBy.title',
		)
		expect(
			await books({ orderBy: { author: { name: { sort: 'asc' } } } }),
		).toBe('orderBy.author.name')
		expect(await books({ orderBy: { pages: { sort: 'up' } } })).toBe(
			'orderBy.pages.sort',
		)
		expect(
			await books({ orderBy: { pages: { sort: 'asc', nulls: 'middle' } } }),
		).toBe('orderBy.pages.nulls')
		expect(
			await books({ orderBy: { pages: { sort: 'asc', way: 'up' } } }),
		).toBe('orderBy.pages.way')
		expect(
			await books({ orderBy: { tags: { _count: { sort: 'asc' } } } }),
		).toBe('orderBy.tags._count')
		expect(
			await books({
				orderBy: [
					{ pages: { sort: 'desc', nulls: 'last' } },
					{ releasedAt: { sort: 'asc' } },
				],
			}),
		).toBeUndefined()
		expect(await books({ cursor: { id: {} } })).toBe('cursor.id')
		expect(await books({ cursor: { id: null } })).toBe('cursor.id')
		expect(
			await books({ orderBy: [{ createdAt: 'asc' }, { id: 'desc' }] }),
		).toBeUndefined()
	})

	it('types where the nulls of an optional field sort', () => {
		type Sorts = NonNullable<ArgsOf<typeof Book, 'findMany'>['orderBy']>
		expectTypeOf<{
			pages: { sort: 'desc'; nulls: 'first' }
		}>().toExtend<Sorts>()
		expectTypeOf<{ pages: 'asc' }>().toExtend<Sorts>()
		expectTypeOf<{ title: { sort: 'asc' } }>().not.toExtend<Sorts>()
		expectTypeOf<{
			pages: { sort: 'asc'; nulls: 'middle' }
		}>().not.toExtend<Sorts>()
		expectTypeOf<{
			author: { profile: { bio: { sort: 'asc'; nulls: 'last' } } }
		}>().toExtend<Sorts>()
		expectTypeOf<{
			author: { name: { sort: 'asc' } }
		}>().not.toExtend<Sorts>()
	})

	it('checks select and include', async () => {
		expect(await authors({ include: { books: { ghost: 1 } } })).toBe(
			'include.books.ghost',
		)
		expect(await authors({ include: { name: true } })).toBe('include.name')
		expect(await authors({ select: { ghost: true } })).toBe('select.ghost')
		expect(await authors({ select: { name: 1 } })).toBe('select.name')
		expect(await authors({ include: { profile: { where: {} } } })).toBe(
			'include.profile.where',
		)
		expect(
			await authors({ select: { id: true, name: false, books: true } }),
		).toBeUndefined()
	})

	it('checks written values and relations', async () => {
		const ada = await query('Author', 'create', { data: { name: 'Ada' } }, as)
		const id =
			typeof ada === 'object' && ada !== null && 'id' in ada ? ada.id : ''
		const create = async (data: object): Promise<unknown> =>
			failure('Book', 'create', {
				data: { title: 'T', author: { connect: { id } }, ...data },
			})
		const issues = async (data: object): Promise<unknown> => {
			const error = await failure('Book', 'create', {
				data: { title: 'T', author: { connect: { id } }, ...data },
			})
			return error instanceof Error && 'details' in error
				? error.details
				: error
		}
		expect(await create({ meta: [1, 'a', { b: true }] })).toBeUndefined()
		expect(await issues({ meta: Number.POSITIVE_INFINITY })).toMatchObject({
			issues: [{ path: ['meta'] }],
		})
		expect(await issues({ meta: new Map() })).toMatchObject({
			issues: [{ path: ['meta'] }],
		})
		expect(
			await failure('Author', 'create', { data: { name: 'G', level: 3 } }),
		).toMatchObject({ code: 'VALIDATION_FAILED' })
		expect(await create({ author: { connect: { id: 1 } } })).toBe(
			'data.author.connect',
		)
		expect(await create({ author: null })).toBe('data.author')
		expect(await create({ tags: { connect: { id } } })).toBe(
			'data.tags.connect',
		)
		const update = async (data: object): Promise<unknown> =>
			failure('Author', 'update', { where: { id }, data })
		expect(await update({ profile: {} })).toBe('data.profile')
		expect(
			await update({ profile: { connect: { id }, disconnect: true } }),
		).toBe('data.profile')
		expect(await update({ profile: { disconnect: false } })).toBe(
			'data.profile.disconnect',
		)
		expect(await update({ books: { connect: [] } })).toBeUndefined()
	})
})

describe('optional relations and defaults (D-53)', () => {
	let team: string | undefined
	const Team = defineModel({
		name: 'Team',
		fields: (f) => ({
			name: f.string({ default: () => 'unnamed' }),
			members: f.many(() => Member),
		}),
	})
	const Member = defineModel({
		name: 'Member',
		fields: (f) => ({
			team: f.one(() => Team, {
				optional: true,
				default: () => (team === undefined ? undefined : { id: team }),
			}),
		}),
	})

	beforeEach(async () => {
		const started = defineApp({ database: memory(), models: [Team, Member] })
		await started.start()
		app = started
	})

	it('computes defaults, a relation one included', async () => {
		const red = await Team.create({ data: {} }, as)
		expect(red.name).toBe('unnamed')
		team = undefined
		const alone = await Member.create({ data: {} }, as)
		team = red.id
		const joined = await Member.create({ data: {} }, as)
		const found = await Member.findMany({ include: { team: true } }, as)
		expect(found.map((member) => [member.id, member.team?.id ?? null])).toEqual(
			[
				[alone.id, null],
				[joined.id, red.id],
			],
		)
	})

	it('disconnects an optional relation from either side', async () => {
		const red = await Team.create({ data: { name: 'red' } }, as)
		team = red.id
		const first = await Member.create({ data: {} }, as)
		const second = await Member.create({ data: {} }, as)
		await Member.update(
			{ where: { id: first.id }, data: { team: { disconnect: true } } },
			as,
		)
		await Team.update(
			{
				where: { id: red.id },
				data: { members: { disconnect: [{ id: second.id }] } },
			},
			as,
		)
		expect(await Member.count({ where: { team: { is: null } } }, as)).toBe(2)
	})
})
