// A json value filtered at a path (D-149): `#>` reaches the value, a missing
// one is unknown, and each operator tests a value of its own JSON type.
import type { Adapter, CreateDataOf, JsonValue, WhereOf } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M = { as: master }

const Doc = defineModel({
	name: 'Doc',
	fields: (f) => ({
		name: f.string({ unique: true }),
		meta: f.json({ optional: true }),
	}),
})

const rows: readonly CreateDataOf<typeof Doc>[] = [
	{
		name: 'ada',
		meta: {
			author: { name: 'Ada', age: 36 },
			tags: ['x', 'y'],
			items: [{ id: 1, kind: 'a' }, { id: 2 }],
			note: null,
			score: 5,
		},
	},
	{
		name: 'bob',
		meta: { author: { name: 'bob' }, tags: ['y'], items: [], score: 'high' },
	},
	{ name: 'cy', meta: [1, 2, 3] },
	{ name: 'nil' },
	{ name: 'str', meta: '50%_off' },
]

const names = async (where: WhereOf<typeof Doc>): Promise<string[]> =>
	(await Doc.findMany({ where, orderBy: { name: 'asc' } }, M)).map(
		(doc) => doc.name,
	)

/** The rows the path filter keeps, and the rows its `NOT` keeps. */
const kept = async (meta: object): Promise<[string[], string[]]> => [
	await names({ meta }),
	await names({ NOT: { meta } }),
]

const contains = (
	path: string[],
	arrayContains: JsonValue,
): Promise<string[]> => names({ meta: { path, arrayContains } })

const at = (path: string[], equals: JsonValue): Promise<string[]> =>
	names({ meta: { path, equals } })

export function jsonPaths(create: () => Adapter): void {
	describe('json paths', () => {
		started(create, [Doc])

		const seeded = async (): Promise<void> => {
			for (const data of rows) await Doc.create({ data }, M)
		}

		it('tests equality at a path, unknown where the path is missing', async () => {
			await seeded()
			const name = ['author', 'name']
			expect(await kept({ path: name, equals: 'Ada' })).toEqual([
				['ada'],
				['bob'],
			])
			expect(await kept({ path: name, not: 'Ada' })).toEqual([['bob'], ['ada']])
			expect(await names({ meta: { path: ['note'], equals: null } })).toEqual([
				'ada',
			])
			expect(await names({ meta: { path: [], equals: [1, 2, 3] } })).toEqual([
				'cy',
			])
			expect(await names({ meta: { path: [], equals: '50%_off' } })).toEqual([
				'str',
			])
			const author = { path: ['author'], equals: { age: 36, name: 'Ada' } }
			expect(await names({ meta: author })).toEqual(['ada'])
		})

		it('compares numbers by value and strings by code point', async () => {
			await seeded()
			const score = ['score']
			expect(await kept({ path: score, gt: 3 })).toEqual([['ada'], ['bob']])
			expect(await kept({ path: score, lt: 10 })).toEqual([['ada'], ['bob']])
			expect(await kept({ path: score, gte: 'high' })).toEqual([
				['bob'],
				['ada'],
			])
			expect(await names({ meta: { path: score, lte: 5 } })).toEqual(['ada'])
			const name = ['author', 'name']
			expect(await kept({ path: name, gt: 'Z' })).toEqual([['bob'], ['ada']])
		})

		it('matches strings literally, and insensitively with mode', async () => {
			await seeded()
			const name = ['author', 'name']
			expect(await names({ meta: { path: [], stringContains: '%_' } })).toEqual(
				['str'],
			)
			expect(
				await names({ meta: { path: name, stringContains: '%' } }),
			).toEqual([])
			expect(
				await names({ meta: { path: name, stringStartsWith: 'a' } }),
			).toEqual([])
			const insensitive = { mode: 'insensitive' } as const
			expect(
				await names({
					meta: { path: name, stringStartsWith: 'a', ...insensitive },
				}),
			).toEqual(['ada'])
			expect(
				await names({
					meta: { path: name, stringEndsWith: 'B', ...insensitive },
				}),
			).toEqual(['bob'])
			expect(await kept({ path: ['score'], stringContains: 'h' })).toEqual([
				['bob'],
				['ada'],
			])
		})

		it('tests arrays with arrayContains, arrayStartsWith and arrayEndsWith', async () => {
			await seeded()
			const tags = ['tags']
			expect(await contains(tags, 'y')).toEqual(['ada', 'bob'])
			expect(await contains(tags, ['y', 'x'])).toEqual(['ada'])
			expect(await contains(tags, [])).toEqual(['ada', 'bob'])
			expect(await contains(['items'], { id: 1 })).toEqual(['ada'])
			expect(await contains([], 2)).toEqual(['cy'])
			expect(await contains([], [[1]])).toEqual([])
			expect(await kept({ path: ['author'], arrayContains: 'Ada' })).toEqual([
				[],
				['ada', 'bob'],
			])
			expect(
				await names({ meta: { path: tags, arrayStartsWith: 'x' } }),
			).toEqual(['ada'])
			expect(await names({ meta: { path: tags, arrayEndsWith: 'y' } })).toEqual(
				['ada', 'bob'],
			)
			const first = { path: ['items'], arrayStartsWith: { kind: 'a', id: 1 } }
			expect(await kept(first)).toEqual([['ada'], ['bob']])
			expect(await kept({ path: ['items'], arrayEndsWith: { id: 2 } })).toEqual(
				[['ada'], ['bob']],
			)
		})

		it('reads an array index as PostgreSQL does', async () => {
			await seeded()
			expect(await at(['items', '0', 'id'], 1)).toEqual(['ada'])
			expect(await at(['items', '-1', 'id'], 2)).toEqual(['ada'])
			expect(await at(['0'], 1)).toEqual(['cy'])
			expect(await at(['-3'], 1)).toEqual(['cy'])
			expect(await at(['-0'], 1)).toEqual(['cy'])
			expect(await at([' 1'], 2)).toEqual(['cy'])
			expect(await at(['+1'], 2)).toEqual(['cy'])
			for (const key of ['1 ', '-4', '3', '99999999999', 'one']) {
				expect(await kept({ path: [key], equals: 2 })).toEqual([[], []])
			}
			expect(await at(['tags', '0', 'x'], 'x')).toEqual([])
		})

		it('filters nothing with a path and no operator', async () => {
			await seeded()
			const all = ['ada', 'bob', 'cy', 'nil', 'str']
			expect(await names({ meta: { path: ['author'] } })).toEqual(all)
			expect(
				await names({ meta: { path: ['author'], mode: 'insensitive' } }),
			).toEqual(all)
			const both = {
				path: ['author', 'name'],
				stringStartsWith: 'A',
				not: 'Ada',
			}
			expect(await names({ meta: both })).toEqual([])
		})
	})
}
