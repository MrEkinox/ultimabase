// The string lists of the contract (D-120): `[]` when unwritten, replaced
// whole, filtered with `has` and `hasSome`, indexed by GIN in PostgreSQL.
import type { Adapter, WhereOf } from 'ultimabase'
import { defineApp, defineModel, master } from 'ultimabase'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { silent } from './silent.ts'

const M = { as: master }

const Article = defineModel({
	name: 'Article',
	fields: (f) => ({
		title: f.string({ unique: true }),
		tags: f.string({ list: true }),
		labels: f.string({ list: true, default: ['new'] }),
	}),
	indexes: [{ fields: ['tags'] }],
})

const titles = async (where: WhereOf<typeof Article>): Promise<string[]> =>
	(await Article.findMany({ where }, M)).map((article) => article.title)

export function lists(create: () => Adapter): void {
	const started = () =>
		defineApp({ database: create(), models: [Article], logger: silent })
	describe('lists', () => {
		let app: ReturnType<typeof started>
		beforeEach(async () => {
			app = started()
			await app.start()
		})
		afterEach(async () => app.stop())

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
			]) {
				await expect(Article.findMany({ where }, M)).rejects.toMatchObject({
					code: 'INVALID_QUERY',
				})
			}
			expect(await Article.count({}, M)).toBe(0)
		})
	})
}
