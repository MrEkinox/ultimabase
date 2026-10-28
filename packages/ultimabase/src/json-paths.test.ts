// A json field's path filter (D-149): the shapes it takes, typed or not, and
// the ones it refuses before it reads.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import type { WhereOf } from './index.ts'
import { defineApp, defineModel, master, memory } from './index.ts'
import { query } from './engine.ts'
import { InvalidQuery } from './errors.ts'
import { z } from 'zod'

const M = { as: master }

const Profile = defineModel({
	name: 'Profile',
	fields: (f) => ({
		name: f.string(),
		prefs: f.json({
			optional: true,
			validate: z.object({ theme: z.string(), sizes: z.array(z.number()) }),
		}),
		extra: f.json({ optional: true }),
	}),
})

describe('json path filters', () => {
	let app: ReturnType<typeof defineApp>
	beforeEach(async () => {
		app = defineApp({ database: memory(), models: [Profile] })
		await app.start()
	})
	afterEach(async () => app.stop())

	it('takes any JSON at a path of a typed json field', async () => {
		expectTypeOf<{
			prefs: { path: ['sizes']; arrayContains: 3 }
		}>().toExtend<WhereOf<typeof Profile>>()
		expectTypeOf<{
			prefs: { path: ['theme']; equals: { any: ['json'] }; mode: 'insensitive' }
		}>().toExtend<WhereOf<typeof Profile>>()
		expectTypeOf<{
			prefs: { equals: { theme: 'dark'; sizes: [] } }
		}>().toExtend<WhereOf<typeof Profile>>()
		expectTypeOf<{
			prefs: { equals: { theme: 1 } }
		}>().not.toExtend<WhereOf<typeof Profile>>()
		expectTypeOf<{
			prefs: { path: ['theme']; gt: true }
		}>().not.toExtend<WhereOf<typeof Profile>>()
		await Profile.create(
			{ data: { name: 'a', prefs: { theme: 'Dark', sizes: [1, 3] } } },
			M,
		)
		await Profile.create({ data: { name: 'b', extra: { theme: 'dark' } } }, M)
		const theme = {
			path: ['theme'],
			stringStartsWith: 'd',
			mode: 'insensitive',
		}
		const found = await Profile.findMany(
			{ where: { prefs: { ...theme, mode: 'insensitive' } } },
			M,
		)
		expect(found.map((row) => row.name)).toEqual(['a'])
		const extra = await Profile.findMany({ where: { extra: theme } }, M)
		expect(extra.map((row) => row.name)).toEqual(['b'])
		const sized = { prefs: { path: ['sizes'], arrayContains: 3 } } as const
		expect(await Profile.count({ where: sized }, M)).toBe(1)
	})

	it('reads a filter without path as a filter of the whole value', async () => {
		await Profile.create({ data: { name: 'a', extra: { path: ['x'] } } }, M)
		const where = { extra: { equals: { path: ['x'] } } }
		expect(await Profile.count({ where }, M)).toBe(1)
		// An untyped json field takes any JSON written in the query.
		expect(
			await Profile.count({ where: { extra: { equals: { path: ['x'] } } } }, M),
		).toBe(1)
		expect(
			await query(
				'Profile',
				'count',
				{ where: { extra: { path: undefined } } },
				M,
			),
		).toBe(1)
	})

	it('refuses a path or an operand it does not take', async () => {
		const refused = [
			{ path: 'theme', equals: 1 },
			{ path: [1], equals: 1 },
			{ path: ['\0'], equals: 1 },
			{ path: [], equals: () => 1 },
			{ path: [], gt: [1] },
			{ path: [], gt: Number.NaN },
			{ path: [], lte: '\uD800' },
			{ path: [], stringContains: 1 },
			{ path: [], mode: 'default', equals: 1 },
			{ path: [], in: [1] },
			{ path: [], arrayEndsWith: new Map() },
		]
		const accepted: unknown[] = []
		for (const extra of refused) {
			const read = query('Profile', 'findMany', { where: { extra } }, M)
			const invalid = await read.then(
				() => false,
				(error: unknown) => error instanceof InvalidQuery,
			)
			if (!invalid) accepted.push(extra)
		}
		expect(accepted).toEqual([])
		await expect(
			query(
				'Profile',
				'findMany',
				{ where: { extra: { stringContains: 'a' } } },
				M,
			),
		).rejects.toMatchObject({ code: 'INVALID_QUERY' })
	})
})
