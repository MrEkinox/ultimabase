// `memory()` driven directly, as the kernel drives an adapter (D-73): reads,
// writes and transactions on prepared input.
import { beforeEach, describe, expect, it } from 'vitest'
import type { Adapter, Change, Filter, Nested, Row } from './adapter.ts'
import { UniqueViolation } from './adapter.ts'
import { memory } from './memory.ts'
import { resolve } from './schema.ts'
import { Author, Book, Profile, Tag } from './test/library.ts'

const { schema } = resolve([Author, Profile, Book, Tag])
let adapter: Adapter

const insert = (model: string, row: Row): Change => ({
	kind: 'insert',
	model,
	row,
})

beforeEach(async () => {
	adapter = memory()
	await adapter.start(schema)
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
		expect(await books({ meta: { lt: { rank: 2 } } })).toEqual(['b2'])
		// A text operator on a value that is not text matches nothing.
		expect(await books({ pages: { contains: '3' } })).toEqual([])
		// `null` stays unknown under NOT: Engines' pages match neither way.
		expect(await books({ pages: { in: [300] } })).toEqual(['b1'])
		expect(await books({ NOT: [{ pages: { contains: '' } }] })).toEqual(['b1'])
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
