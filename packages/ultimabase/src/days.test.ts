// A calendar day (D-150): the string '2026-07-31' of a real day, years 1 to
// 9999, refused otherwise in a write and in a filter.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import type { RecordOf, WhereOf } from './index.ts'
import { defineApp, defineModel, master, memory } from './index.ts'
import { query } from './engine.ts'

const M = { as: master }

const Holiday = defineModel({
	name: 'Holiday',
	fields: (f) => ({
		on: f.date(),
		until: f.date({ optional: true }),
	}),
})

const refused = [
	'2023-02-29',
	'2026-13-01',
	'2026-04-31',
	'0000-01-01',
	'2026-7-31',
	'2026-07-31T00:00:00Z',
	' 2026-07-31',
	new Date('2026-07-31'),
	20260731,
]

describe('a calendar day', () => {
	let app: ReturnType<typeof defineApp>
	beforeEach(async () => {
		app = defineApp({ database: memory(), models: [Holiday] })
		await app.start()
	})
	afterEach(async () => app.stop())

	it('is a string, filtered as a day', () => {
		expectTypeOf<RecordOf<typeof Holiday>['on']>().toEqualTypeOf<string>()
		expectTypeOf<RecordOf<typeof Holiday>['until']>().toEqualTypeOf<
			string | null
		>()
		expectTypeOf<{
			on: { gte: '2026-01-01'; notIn: ['2026-05-01'] }
		}>().toExtend<WhereOf<typeof Holiday>>()
		expectTypeOf<{ on: { contains: '2026' } }>().not.toExtend<
			WhereOf<typeof Holiday>
		>()
	})

	it('takes a real day of years 1 to 9999', async () => {
		for (const on of ['2024-02-29', '0001-01-01', '9999-12-31']) {
			expect(await Holiday.create({ data: { on } }, M)).toMatchObject({
				on,
				until: null,
			})
		}
	})

	it('refuses anything else in a write', async () => {
		const accepted: unknown[] = []
		for (const on of refused) {
			const created = query('Holiday', 'create', { data: { on } }, M)
			const failed = await created.then(
				() => false,
				(error: unknown) => {
					expect(error).toMatchObject({
						code: 'VALIDATION_FAILED',
						details: {
							issues: [
								{
									path: ['on'],
									message: "Expected a day written '2026-07-31'.",
								},
							],
						},
					})
					return true
				},
			)
			if (!failed) accepted.push(on)
		}
		expect(accepted).toEqual([])
	})

	it('refuses anything else in a filter', async () => {
		const accepted: unknown[] = []
		for (const on of refused) {
			const read = query(
				'Holiday',
				'findMany',
				{ where: { on: { lt: on } } },
				M,
			)
			const failed = await read.then(
				() => false,
				(error: unknown) => {
					expect(error).toMatchObject({ code: 'INVALID_QUERY' })
					return true
				},
			)
			if (!failed) accepted.push(on)
		}
		expect(accepted).toEqual([])
	})

	it('makes no list', () => {
		expect(() =>
			defineModel({
				name: 'Listed',
				// @ts-expect-error: a day makes no list.
				fields: (f) => ({ on: f.date({ list: true }) }),
			}),
		).toThrow(
			'f.date() makes no list: a list holds strings, numbers or enum values.',
		)
	})
})
