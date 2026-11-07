// `afterKeys` (D-288) walks a list a row at a time through the same rows, in
// the same order, as the read of the whole list: `null`s, ties and every kind
// of key included.
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { Logger } from './index.ts'
import { defineApp, defineModel, master, memory } from './index.ts'
import type { Filter, Order } from './adapter.ts'
import { afterKeys, sortKeys, storedRows } from './live.ts'

const M = { as: master }
const quiet: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => quiet,
}
const Thing = defineModel({
	name: 'Thing',
	fields: (f) => ({
		name: f.string({ optional: true }),
		price: f.decimal({ precision: 10, scale: 2, optional: true }),
		at: f.dateTime({ optional: true }),
		on: f.boolean({ optional: true }),
		rank: f.number({ optional: true }),
		day: f.date({ optional: true }),
		state: f.enumOf(['open', 'Closed', 'done'], { optional: true }),
	}),
})

let app: ReturnType<typeof defineApp>
beforeEach(async () => {
	app = defineApp({ database: memory(), models: [Thing], logger: quiet })
	await app.start()
	const names = ['b', 'a', null, 'B', 'é', 'a']
	const prices = ['10.50', '9.75', null, '10.50', '-1.00', '100.00']
	const dates = [
		new Date('2026-01-02T03:04:05.678Z'),
		null,
		new Date('2025-01-01T00:00:00.000Z'),
		new Date('2026-01-02T03:04:05.678Z'),
		null,
		new Date('2027-06-01T00:00:00.000Z'),
	]
	const flags = [true, false, null, true, false, null]
	const ranks = [1.5, -2, null, 1.5, 0, null]
	const days = ['2026-01-02', null, '2025-12-31', '2026-01-02']
	const states = ['open', 'Closed', null, 'done', 'open'] as const
	for (let at = 0; at < 24; at += 1) {
		await Thing.create(
			{
				data: {
					name: names[at % 6] ?? null,
					price: prices[at % 5] ?? null,
					at: dates[at % 4] ?? null,
					on: flags[at % 3] ?? null,
					rank: ranks[at % 6] ?? null,
					day: days[at % 4] ?? null,
					state: states[at % 5] ?? null,
				},
			},
			M,
		)
	}
})
afterEach(async () => app.stop())

const fields = ['name', 'price', 'at', 'on', 'rank', 'day', 'state'] as const
const orders: readonly (readonly Order[])[] = fields.flatMap((field) => [
	[{ field, direction: 'asc' }],
	[{ field, direction: 'desc' }],
	[{ field, direction: 'asc', nulls: 'first' }],
	[{ field, direction: 'desc', nulls: 'last' }],
	[
		{ field, direction: 'desc' },
		{ field: 'name', direction: 'asc' },
	],
])

it.each(orders.map((order) => [JSON.stringify(order), order] as const))(
	'walks %s',
	async (_, order) => {
		const orderBy: readonly Order[] = [
			...order,
			{ field: 'id', direction: 'asc' },
		]
		const whole = await storedRows('Thing', { orderBy })
		const walked: string[] = []
		let after: Filter | undefined
		for (;;) {
			const read = { ...(after && { where: after }), orderBy, take: 1 }
			const [row] = await storedRows('Thing', read)
			if (row === undefined) break
			walked.push(row.id)
			after = afterKeys('Thing', sortKeys('Thing', row, orderBy), orderBy)
		}
		expect(walked).toEqual(whole.map(({ id }) => id))
	},
)

it('takes every row with no order', async () => {
	expect(afterKeys('Thing', [], [])).toEqual({})
})
