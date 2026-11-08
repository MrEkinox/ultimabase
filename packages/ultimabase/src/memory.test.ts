// `memory()` driven directly, as the kernel drives an adapter (D-73): reads,
// writes and transactions on prepared input.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
	Adapter,
	Change,
	Changed,
	Filter,
	Nested,
	Row,
} from './adapter.ts'
import type { Logger } from './app-options.ts'
import { UniqueViolation } from './adapter.ts'
import { memory } from './memory.ts'
import { resolve } from './schema.ts'
import { Author, Book, Profile, Tag } from './test/library.ts'

const logger: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => logger,
}

const { schema } = resolve([Author, Profile, Book, Tag])
let adapter: Adapter

const insert = (model: string, row: Row): Change => ({
	kind: 'insert',
	model,
	row,
})

beforeEach(async () => {
	adapter = memory()
	await adapter.start(schema, logger)
	await adapter.write({
		changes: [
			insert('Author', { id: 'a1', name: 'Ada', level: 'junior' }),
			insert('Author', { id: 'a2', name: 'Grace', level: 'senior' }),
			insert('Profile', { id: 'p1', bio: null, author: 'a1' }),
			insert('Book', {
				id: 'b1',
				title: 'Analysis',
				pages: 300,
				published: true,
				meta: { rank: 2 },
				author: 'a1',
			}),
			insert('Book', {
				id: 'b2',
				title: 'Engines',
				pages: null,
				published: false,
				meta: { rank: 1 },
				author: 'a2',
			}),
			insert('Tag', { id: 't1', label: 'math' }),
			{
				kind: 'link',
				model: 'Book',
				field: 'tags',
				id: 'b1',
				targets: ['t1'],
			},
		],
	})
})

const ids = async (
	model: string,
	read: Nested = {},
): Promise<readonly string[]> =>
	(await adapter.find({ model, ...read })).map((row) => row.id)

const books = async (where: Filter): Promise<readonly string[]> =>
	ids('Book', { where })

describe('reads', () => {
	it('needs start and a known model', async () => {
		await expect(memory().find({ model: 'Book' })).rejects.toThrow(
			'memory() is not started.',
		)
		await expect(adapter.find({ model: 'Ghost' })).rejects.toThrow(
			'Unknown model Ghost.',
		)
	})

	it('compares scalars with every operator', async () => {
		expect(await books({ pages: { lte: 300 } })).toEqual(['b1'])
		expect(await books({ pages: { gte: 301 } })).toEqual([])
		expect(await books({ title: { endsWith: 'nes' } })).toEqual(['b2'])
		expect(await books({ title: { notIn: ['Analysis'] } })).toEqual(['b2'])
		expect(await books({ title: { in: [] } })).toEqual([])
		expect(await books({ title: { notIn: [] } })).toEqual(['b1', 'b2'])
		expect(await books({ published: { gt: false } })).toEqual(['b1'])
		// A text operator on a value that is not text matches nothing.
		expect(await books({ pages: { contains: '3' } })).toEqual([])
		// `null` stays unknown under NOT: Engines' pages match neither way.
		expect(await books({ pages: { in: [300] } })).toEqual(['b1'])
		expect(await books({ NOT: [{ pages: { contains: '' } }] })).toEqual(['b1'])
	})

	it('finds a value in a list as PostgreSQL does (D-328)', async () => {
		const titles = ['ENGINES', 'nothing']
		expect(await books({ title: { in: titles } })).toEqual([])
		expect(await books({ title: { in: titles, mode: 'insensitive' } })).toEqual(
			['b2'],
		)
		expect(
			await books({ title: { notIn: titles, mode: 'insensitive' } }),
		).toEqual(['b1'])
		// The same list again finds the same rows.
		expect(await books({ title: { in: titles } })).toEqual([])
		expect(await books({ published: { in: [false, 'false'] } })).toEqual(['b2'])
		expect(await books({ pages: { notIn: [300, '300'] } })).toEqual([])
		expect(await books({ meta: { in: [{ rank: 1 }, 'b1'] } })).toEqual(['b2'])
		expect(
			await books({ meta: { in: [{ rank: 2 }], mode: 'insensitive' } }),
		).toEqual(['b1'])
	})

	it('filters on a relation being set or not', async () => {
		expect(await ids('Author', { where: { profile: { is: null } } })).toEqual([
			'a2',
		])
		expect(
			await ids('Author', { where: { profile: { isNot: null } } }),
		).toEqual(['a1'])
		expect(
			await ids('Author', {
				where: { books: { none: { title: { equals: 'Engines' } } } },
			}),
		).toEqual(['a1'])
		expect(
			await books({ author: { isNot: { name: { equals: 'Ada' } } } }),
		).toEqual(['b2'])
	})

	it('treats a field it does not know as unset', async () => {
		expect(await books({ ghost: { equals: null } })).toEqual(['b1', 'b2'])
	})

	it('refuses a list where a condition goes', async () => {
		await expect(books({ title: [{}] })).rejects.toThrow(
			'Book.title takes a condition, not a list.',
		)
	})

	it('pages from the start, the end and a cursor', async () => {
		const cursor = { id: { equals: 'b2' } }
		expect(await ids('Book', { take: 0 })).toEqual([])
		expect(await ids('Book', { take: -1 })).toEqual(['b2'])
		expect(await ids('Book', { take: -1, skip: 2 })).toEqual([])
		expect(await ids('Book', { cursor: { id: { equals: 'b9' } } })).toEqual([])
		// The cursor row is filtered out and no row comes after it.
		expect(
			await ids('Book', {
				cursor,
				where: { title: { equals: 'Analysis' } },
			}),
		).toEqual([])
	})

	it('reads by id as by any filter (D-305)', async () => {
		expect(await books({ id: { equals: 'b2' } })).toEqual(['b2'])
		expect(await books({ id: { in: ['b2', 'b9', 'b2', 'b1'] } })).toEqual([
			'b1',
			'b2',
		])
		expect(await books({ id: { in: [] } })).toEqual([])
		expect(
			await books({
				AND: [{ title: { equals: 'Engines' } }, { id: { in: ['b2'] } }],
			}),
		).toEqual(['b2'])
		// The id pins nothing with another operator, or a value not an id.
		expect(await books({ id: { equals: 'B1', mode: 'insensitive' } })).toEqual([
			'b1',
		])
		expect(await books({ id: { in: [null] } })).toEqual([])
		expect(await books({ id: { not: 'b1' } })).toEqual(['b2'])
		expect(
			await ids('Book', { cursor: { id: { equals: 'b1' } }, take: 1, skip: 1 }),
		).toEqual(['b2'])
	})

	it('includes relations, null when the nested filter refuses', async () => {
		const [ada] = await adapter.find({
			model: 'Author',
			where: { id: { equals: 'a1' } },
			include: {
				profile: { where: { bio: { not: null } } },
				name: {},
			},
		})
		expect(ada).toEqual({
			id: 'a1',
			name: 'Ada',
			level: 'junior',
			profile: null,
		})
	})
})

describe('writes', () => {
	it('returns no rows without a read', async () => {
		expect(
			await adapter.write({ changes: [insert('Tag', { id: 't2' })] }),
		).toEqual([])
	})

	it('changes nothing when a write fails', async () => {
		const failed = adapter.write({
			changes: [insert('Tag', { id: 't2' }), insert('Tag', { id: 't1' })],
		})
		await expect(failed).rejects.toBeInstanceOf(UniqueViolation)
		await expect(failed).rejects.toMatchObject({ fields: ['id'] })
		expect(await ids('Tag')).toEqual(['t1'])
	})

	it('puts back what a failed write deleted, updated and linked', async () => {
		const failed = adapter.write({
			changes: [
				{ kind: 'delete', model: 'Book', where: { id: { equals: 'b1' } } },
				{
					kind: 'update',
					model: 'Book',
					where: { id: { equals: 'b2' } },
					set: { title: 'Changed' },
				},
				{
					kind: 'link',
					model: 'Book',
					field: 'tags',
					id: 'b2',
					targets: ['t1'],
				},
				insert('Tag', { id: 't1' }),
			],
		})
		await expect(failed).rejects.toBeInstanceOf(UniqueViolation)
		const rows = await adapter.find({
			model: 'Book',
			fields: ['title'],
			include: { tags: { fields: [] } },
		})
		expect(rows).toEqual([
			{ id: 'b1', title: 'Analysis', tags: [{ id: 't1' }] },
			{ id: 'b2', title: 'Engines', tags: [] },
		])
	})

	it('puts back the links a failed unlink removed', async () => {
		const failed = adapter.write({
			changes: [
				{
					kind: 'unlink',
					model: 'Book',
					field: 'tags',
					id: 'b1',
					targets: ['t1'],
				},
				insert('Tag', { id: 't1' }),
			],
		})
		await expect(failed).rejects.toBeInstanceOf(UniqueViolation)
		const [math] = await adapter.find({
			model: 'Tag',
			include: { books: { fields: [] } },
		})
		expect(math?.['books']).toEqual([{ id: 'b1' }])
	})

	it('links only through a join', async () => {
		const linked = adapter.write({
			changes: [
				{
					kind: 'link',
					model: 'Author',
					field: 'books',
					id: 'a1',
					targets: ['b1'],
				},
			],
		})
		await expect(linked).rejects.toThrow('Author.books has no join.')
	})

	it('deletes by the rows a delete before removed, and by no other change', async () => {
		const byAuthor = { author: { removedBy: 0 } }
		await adapter.write({
			changes: [
				{ kind: 'delete', model: 'Author', where: { id: { equals: 'a1' } } },
				{ kind: 'delete', model: 'Book', where: byAuthor },
			],
		})
		expect(await ids('Book')).toEqual(['b2'])
		const failed = adapter.write({
			changes: [
				insert('Tag', { id: 't2' }),
				{ kind: 'delete', model: 'Book', where: byAuthor },
			],
		})
		await expect(failed).rejects.toThrow('No such delete.')
	})

	it('removes the links of a deleted row', async () => {
		await adapter.write({
			changes: [
				{ kind: 'delete', model: 'Book', where: { id: { equals: 'b1' } } },
			],
		})
		const [math] = await adapter.find({
			model: 'Tag',
			include: { books: {} },
		})
		expect(math?.['books']).toEqual([])
	})
})

describe('transactions', () => {
	it('shows its writes to others once committed', async () => {
		const tx = await adapter.begin()
		await tx.write({ changes: [insert('Tag', { id: 't2' })] })
		expect(await tx.count({ model: 'Tag' })).toBe(2)
		expect(await ids('Tag')).toEqual(['t1'])
		await tx.commit()
		expect(await ids('Tag')).toEqual(['t1', 't2'])
		await expect(tx.find({ model: 'Tag' })).rejects.toThrow(
			'The transaction has ended.',
		)
	})

	it('drops its writes on rollback', async () => {
		const tx = await adapter.begin()
		await tx.write({ changes: [insert('Tag', { id: 't2' })] })
		await tx.rollback()
		expect(await ids('Tag')).toEqual(['t1'])
		await expect(tx.commit()).rejects.toThrow('The transaction has ended.')
	})

	it('keeps its state when one of its writes fails', async () => {
		const tx = await adapter.begin()
		await tx.write({ changes: [insert('Tag', { id: 't2' })] })
		await expect(
			tx.write({ changes: [insert('Tag', { id: 't1' })] }),
		).rejects.toBeInstanceOf(UniqueViolation)
		expect((await tx.find({ model: 'Tag' })).map((row) => row.id)).toEqual([
			't1',
			't2',
		])
		await tx.rollback()
	})

	it('hides its deletes and links from others until it commits', async () => {
		const tx = await adapter.begin()
		await tx.write({
			changes: [
				{ kind: 'delete', model: 'Book', where: { id: { equals: 'b1' } } },
				{
					kind: 'link',
					model: 'Book',
					field: 'tags',
					id: 'b2',
					targets: ['t1'],
				},
			],
		})
		const tags = async (): Promise<unknown> =>
			(
				await adapter.find({ model: 'Tag', include: { books: { fields: [] } } })
			)[0]?.['books']
		expect(await ids('Book')).toEqual(['b1', 'b2'])
		expect(await tags()).toEqual([{ id: 'b1' }])
		await tx.commit()
		expect(await ids('Book')).toEqual(['b2'])
		expect(await tags()).toEqual([{ id: 'b2' }])
		// After the commit, writes change the committed rows.
		await adapter.write({ changes: [insert('Tag', { id: 't2' })] })
		expect(await ids('Tag')).toEqual(['t1', 't2'])
	})

	it('makes other writes and stop wait until it ends', async () => {
		const tx = await adapter.begin()
		const order: string[] = []
		const written = adapter
			.write({ changes: [insert('Tag', { id: 't3' })] })
			.then(() => order.push('write'))
		const stopped = adapter.stop().then(() => order.push('stop'))
		await tx.write({ changes: [insert('Tag', { id: 't2' })] })
		order.push('commit')
		await tx.commit()
		await Promise.all([written, stopped])
		expect(order).toEqual(['commit', 'write', 'stop'])
		expect(await ids('Tag')).toEqual(['t1', 't2', 't3'])
	})
})

describe('the feed', () => {
	it('tells a write of more rows than a call takes arguments', async () => {
		// A spread of this many items into a call overflows the stack.
		const many = 200_000
		const fed: (readonly Changed[])[] = []
		const watched = memory()
		await watched.start(schema, logger, {
			changed: (changes) => fed.push(changes),
			missed: () => undefined,
		})
		const author = insert('Author', { id: 'a1', name: 'Ada' })
		const shelf = Array.from({ length: many }, (_, at) =>
			insert('Book', { id: `b${at}`, title: `${at}`, author: 'a1' }),
		)
		const tx = await watched.begin()
		await tx.write({ changes: [author, ...shelf] })
		await tx.commit()
		const set = { pages: 300 }
		await watched.write({
			changes: [{ kind: 'update', model: 'Book', where: {}, set }],
		})
		await vi.waitFor(() => expect(fed).toHaveLength(2))
		expect(fed).toEqual([
			[
				{ kind: 'insert', model: 'Author', ids: ['a1'] },
				{ kind: 'insert', model: 'Book' },
			],
			[{ kind: 'update', model: 'Book', fields: ['pages'] }],
		])
	}, 30_000)
})
