// The lists of the contract (D-120, D-127, D-149): of strings, numbers or
// enum values, `[]` when unwritten, replaced whole or updated with `push`,
// `pushUnique` or `remove`, filtered with `has`, `hasSome`, `hasEvery` and
// `isEmpty`, indexed by GIN in PostgreSQL.
import type { Adapter, UpdateDataOf, WhereOf } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M = { as: master }

const Article = defineModel({
	name: 'Article',
	fields: (f) => ({
		title: f.string({ unique: true }),
		tags: f.string({ list: true }),
		labels: f.string({ list: true, default: ['new'] }),
		scores: f.number({ list: true }),
		sizes: f.enumOf(['S', 'M', 'L'], { list: true, default: ['M'] }),
	}),
	indexes: [
		{ fields: ['tags'] },
		{ fields: ['scores'] },
		{ fields: ['sizes'] },
	],
})

/** An update hook: `updateMany` locks the rows and groups their writes. */
const Shelf = defineModel({
	name: 'Shelf',
	fields: (f) => ({ tags: f.string({ list: true }) }),
}).with({ hooks: { beforeUpdate: () => {} } })

const titles = async (where: WhereOf<typeof Article>): Promise<string[]> =>
	(await Article.findMany({ where }, M)).map((article) => article.title)

export function lists(create: () => Adapter): void {
	describe('lists', () => {
		started(create, [Article, Shelf])

		it('stores a list, [] when unwritten, and replaces it whole', async () => {
			const ts = await Article.create(
				{ data: { title: 'ts', tags: ['ts', 'node'] } },
				M,
			)
			expect(ts).toMatchObject({ tags: ['ts', 'node'], labels: ['new'] })
			expect(
				await Article.create({ data: { title: 'none', labels: [] } }, M),
			).toMatchObject({ tags: [], labels: [] })
			await Article.update(
				{ where: { id: ts.id }, data: { tags: ['go', 'go'] } },
				M,
			)
			expect(
				await Article.findUnique({ where: { title: 'ts' } }, M),
			).toMatchObject({ tags: ['go', 'go'], labels: ['new'] })
		})

		it('filters a list with has, hasSome and NOT', async () => {
			for (const [title, tags] of [
				['a', ['ts', 'node']],
				['b', ['go']],
				['c', []],
			] as const) {
				await Article.create({ data: { title, tags } }, M)
			}
			expect(await titles({ tags: { has: 'ts' } })).toEqual(['a'])
			expect(await titles({ tags: { has: 'rust' } })).toEqual([])
			expect(await titles({ tags: { hasSome: ['go', 'node'] } })).toEqual([
				'a',
				'b',
			])
			expect(await titles({ tags: { hasSome: [] } })).toEqual([])
			expect(await titles({ NOT: { tags: { has: 'ts' } } })).toEqual(['b', 'c'])
			expect(
				await titles({ tags: { has: 'node', hasSome: ['go', 'ts'] } }),
			).toEqual(['a'])
		})

		it('filters a list with hasEvery and isEmpty', async () => {
			for (const [title, tags, scores, sizes] of [
				['a', ['ts', 'node', 'ts'], [1, 2], ['S', 'L']],
				['b', ['ts'], [2], []],
				['c', [], [], ['L']],
			] as const) {
				await Article.create({ data: { title, tags, scores, sizes } }, M)
			}
			expect(await titles({ tags: { hasEvery: ['node', 'ts'] } })).toEqual([
				'a',
			])
			expect(await titles({ tags: { hasEvery: ['ts', 'ts'] } })).toEqual([
				'a',
				'b',
			])
			expect(await titles({ tags: { hasEvery: [] } })).toEqual(['a', 'b', 'c'])
			expect(await titles({ scores: { hasEvery: [2] } })).toEqual(['a', 'b'])
			expect(await titles({ sizes: { hasEvery: ['L', 'S'] } })).toEqual(['a'])
			expect(await titles({ tags: { isEmpty: true } })).toEqual(['c'])
			expect(await titles({ sizes: { isEmpty: false } })).toEqual(['a', 'c'])
			expect(await titles({ NOT: { scores: { isEmpty: true } } })).toEqual([
				'a',
				'b',
			])
			expect(
				await titles({
					tags: { hasEvery: ['ts'], isEmpty: false, has: 'node' },
				}),
			).toEqual(['a'])
		})

		it('updates a list with set, push, pushUnique and remove', async () => {
			const { id } = await Article.create(
				{ data: { title: 'a', tags: ['a', 'a'], scores: [1, 2, 1] } },
				M,
			)
			const updated = (data: UpdateDataOf<typeof Article>) =>
				Article.update({ where: { id }, data }, M)
			const tags = async (data: UpdateDataOf<typeof Article>['tags']) =>
				(await updated({ tags: data })).tags
			expect(await tags({ pushUnique: 'b' })).toEqual(['a', 'a', 'b'])
			expect(await tags({ pushUnique: ['a', 'c', 'c', 'd'] })).toEqual([
				'a',
				'a',
				'b',
				'c',
				'd',
			])
			expect(await tags({ push: ['b', 'b'] })).toEqual([
				'a',
				'a',
				'b',
				'c',
				'd',
				'b',
				'b',
			])
			expect(await tags({ remove: ['a', 'z'] })).toEqual([
				'b',
				'c',
				'd',
				'b',
				'b',
			])
			expect(await tags({ remove: 'b' })).toEqual(['c', 'd'])
			expect(await tags({ push: ['"', 'NULL', '{}'] })).toEqual([
				'c',
				'd',
				'"',
				'NULL',
				'{}',
			])
			expect(await tags({ remove: ['NULL', 'c'] })).toEqual(['d', '"', '{}'])
			expect(await tags({ push: [] })).toEqual(['d', '"', '{}'])
			expect(await tags({ push: undefined })).toEqual(['d', '"', '{}'])
			expect(await tags({ set: 'x' })).toEqual(['x'])
			expect(
				await updated({
					scores: { remove: 1 },
					sizes: { pushUnique: ['L', 'M', 'L'] },
					labels: { set: [] },
				}),
			).toMatchObject({ scores: [2], sizes: ['M', 'L'], labels: [] })
			const upserted = await Article.upsert(
				{
					where: { id },
					create: { title: 'b' },
					update: { tags: { pushUnique: ['x', 'y'] } },
				},
				M,
			)
			expect(upserted.tags).toEqual(['x', 'y'])
		})

		it('updates the lists of many rows, with or without their hooks', async () => {
			for (const [title, tags] of [
				['a', ['x', 'y', 'x']],
				['b', []],
			] as const) {
				await Article.create({ data: { title, tags } }, M)
				await Shelf.create({ data: { tags } }, M)
			}
			for (const model of [Article, Shelf]) {
				expect(
					await model.updateMany({ data: { tags: { remove: 'x' } } }, M),
				).toEqual({ count: 2 })
				expect(
					await model.updateMany({ data: { tags: { pushUnique: 'z' } } }, M),
				).toEqual({ count: 2 })
			}
			expect((await Article.findMany({}, M)).map((row) => row.tags)).toEqual([
				['y', 'z'],
				['z'],
			])
			expect((await Shelf.findMany({}, M)).map((row) => row.tags)).toEqual([
				['y', 'z'],
				['z'],
			])
		})

		it('refuses a list operation that is not one, or a bad element', async () => {
			const { id } = await Article.create(
				{ data: { title: 'a', tags: ['a'] } },
				M,
			)
			const takes =
				'data.tags takes a list or one of set, push, pushUnique, remove.'
			const refusals: [unknown, string, string][] = [
				[{}, 'INVALID_QUERY', takes],
				[{ push: 'b', remove: 'a' }, 'INVALID_QUERY', takes],
				[{ append: 'b' }, 'INVALID_QUERY', takes],
				[{ push: '' }, 'VALIDATION_FAILED', 'Invalid data.'],
				[{ pushUnique: ['b', '\0'] }, 'VALIDATION_FAILED', 'Invalid data.'],
			]
			for (const [tags, code, message] of refusals) {
				await expect(
					// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the test sends what the types refuse.
					Article.update({ where: { id }, data: { tags } as { tags: [] } }, M),
				).rejects.toMatchObject({ code, message })
			}
			await expect(
				Article.update({ where: { id }, data: { tags: { push: '' } } }, M),
			).rejects.toMatchObject({
				details: {
					issues: [
						{
							path: ['tags'],
							message:
								'Expected a list of non-empty strings without a NUL or a lone surrogate.',
						},
					],
				},
			})
			const pushed: unknown = { push: 'a' }
			const data = { title: 'b', tags: pushed } as { title: string }
			await expect(Article.create({ data }, M)).rejects.toMatchObject({
				code: 'VALIDATION_FAILED',
			})
			expect(await Article.findUnique({ where: { id } }, M)).toMatchObject({
				tags: ['a'],
			})
		})

		it('stores and filters numbers and enum values', async () => {
			const a = await Article.create(
				{ data: { title: 'a', scores: [1.5, -2, 0, 1.5], sizes: ['S', 'L'] } },
				M,
			)
			expect(a).toMatchObject({ scores: [1.5, -2, 0, 1.5], sizes: ['S', 'L'] })
			expect(
				await Article.create({ data: { title: 'b', scores: [1e300] } }, M),
			).toMatchObject({ scores: [1e300], sizes: ['M'] })
			await Article.create({ data: { title: 'c', sizes: [] } }, M)
			expect(await titles({ scores: { has: -2 } })).toEqual(['a'])
			expect(await titles({ scores: { has: 2 } })).toEqual([])
			expect(await titles({ scores: { hasSome: [0, 1e300] } })).toEqual([
				'a',
				'b',
			])
			expect(await titles({ sizes: { has: 'M' } })).toEqual(['b'])
			expect(await titles({ sizes: { hasSome: ['S', 'M'] } })).toEqual([
				'a',
				'b',
			])
			expect(await titles({ NOT: { sizes: { has: 'S' } } })).toEqual(['b', 'c'])
			await Article.update(
				{ where: { id: a.id }, data: { scores: [], sizes: ['L', 'L'] } },
				M,
			)
			expect(
				await Article.findUnique({ where: { title: 'a' } }, M),
			).toMatchObject({ scores: [], sizes: ['L', 'L'] })
		})

		it('stores any well-formed text as an element', async () => {
			const tags = ['"', '\\', 'a,b', '{}', ' ', 'NULL', 'é😀']
			await Article.create({ data: { title: 'odd', tags } }, M)
			expect(
				await Article.findUnique({ where: { title: 'odd' } }, M),
			).toMatchObject({ tags })
			for (const tag of tags) {
				expect(await titles({ tags: { has: tag } })).toEqual(['odd'])
			}
			expect(await titles({ tags: { hasSome: ['null'] } })).toEqual([])
		})

		it('refuses an empty element, a NUL or a lone surrogate', async () => {
			for (const tags of [[''], ['a\0'], ['\uD800']]) {
				await expect(
					Article.create({ data: { title: 'bad', tags } }, M),
				).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
			}
			for (const where of [
				{ tags: { has: '' } },
				{ tags: { hasSome: ['\0'] } },
				{ tags: { hasEvery: [''] } },
			]) {
				await expect(Article.findMany({ where }, M)).rejects.toMatchObject({
					code: 'INVALID_QUERY',
				})
			}
			expect(await Article.count({}, M)).toBe(0)
		})
	})
}
