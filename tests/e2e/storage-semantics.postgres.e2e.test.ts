import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'

// Conformance of the storage semantics written by ADR-0302 and of the
// automatic retry of ADR-0300 on PostgreSQL. These cases move into the
// adapter-parameterized suite when a second database adapter exists.
const App = UltimaBase.use(hooksPlugin())

const Item = App.Schema.define({
	className: 'SemanticsItem',
	fields: (field) => ({
		code: field.string({ indexed: 'unique' }),
		group: field.string(),
		rank: field.int(),
		tags: field.string({ list: true }),
		amount: field.decimal({ precision: 30, scale: 10 }),
	}),
}).with({ indexes: [{ fields: ['group', 'rank'], unique: true }] })

/** Barrier making both first attempts hold their first row before the second. */
let arrivals = 0
let releaseArrivals: (() => void) | undefined
const bothArrived = new Promise<void>((resolve) => {
	releaseArrivals = resolve
})
const awaitPartner = async (): Promise<void> => {
	arrivals += 1
	if (arrivals === 2) releaseArrivals?.()
	await Promise.race([
		bothArrived,
		new Promise((resolve) => setTimeout(resolve, 2_000)),
	])
}
const hookRuns = { left: 0, right: 0 }
const partners = { left: '', right: '' }

const Left = App.Schema.define({
	className: 'SemanticsLeft',
	fields: (field) => ({
		touchPartner: field.boolean({ required: true, default: false }),
		value: field.int({ required: true, default: 0 }),
	}),
}).with({
	hooks: {
		afterOperation: {
			update: async ({ item }) => {
				if (!item.touchPartner) return
				hookRuns.left += 1
				await awaitPartner()
				await Right.updateOne({
					where: { id: partners.right },
					data: { touchPartner: false, value: { increment: 1 } },
				})
			},
		},
	},
})

const Right = App.Schema.define({
	className: 'SemanticsRight',
	fields: (field) => ({
		touchPartner: field.boolean({ required: true, default: false }),
		value: field.int({ required: true, default: 0 }),
	}),
}).with({
	hooks: {
		afterOperation: {
			update: async ({ item }) => {
				if (!item.touchPartner) return
				hookRuns.right += 1
				await awaitPartner()
				await Left.updateOne({
					where: { id: partners.left },
					data: { touchPartner: false, value: { increment: 1 } },
				})
			},
		},
	},
})

const createApplication = (fixture: PostgresWorkerFixture) =>
	new (UltimaBase.use(
		hooksPlugin(),
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
	))({
		pluginPrivileges: { logger: false },
		schemas: [Item, Left, Right],
	})

let fixture: PostgresWorkerFixture | undefined
let ultimabase: ReturnType<typeof createApplication> | undefined

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'semantics' })
	ultimabase = createApplication(fixture)
	await ultimabase.start()
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe('written storage semantics (ADR-0302)', { concurrent: false }, () => {
	it('allows several nulls in unique indexes and reports duplicates neutrally', async () => {
		await Item.createMany({
			data: [
				{ code: null, group: 'nulls', rank: null },
				{ code: null, group: 'nulls', rank: null },
				{ code: 'unique-a', group: null, rank: 1 },
				{ code: 'unique-b', group: null, rank: 1 },
			],
		})

		await expect(
			Item.createOne({ data: { code: 'unique-a' } }),
		).rejects.toMatchObject({
			code: 'UNIQUE_VIOLATION',
			publicDetails: { fields: ['code'], schema: 'SemanticsItem' },
		})
		await expect(
			Item.createOne({ data: { group: 'ranked', rank: 7 } }).then(() =>
				Item.createOne({ data: { group: 'ranked', rank: 7 } }),
			),
		).rejects.toMatchObject({
			code: 'UNIQUE_VIOLATION',
			publicDetails: { fields: ['group', 'rank'], schema: 'SemanticsItem' },
		})
	})

	it('sorts null last in ascending and descending order', async () => {
		await Item.createMany({
			data: [
				{ group: 'order', rank: 2 },
				{ group: 'order', rank: null },
				{ group: 'order', rank: 1 },
			].map((data, index) => ({ ...data, code: `order-${String(index)}` })),
		})
		const ranks = async (direction: 'asc' | 'desc') =>
			(
				await Item.findMany({
					where: { group: { eq: 'order' } },
					orderBy: { rank: direction },
				})
			).map(({ rank }) => rank)

		await expect(ranks('asc')).resolves.toStrictEqual([1, 2, null])
		await expect(ranks('desc')).resolves.toStrictEqual([2, 1, null])
	})

	it('compares whole lists for equality and members with list operators', async () => {
		await Item.createMany({
			data: [
				{ code: 'list-a', tags: ['a'] },
				{ code: 'list-ab', tags: ['a', 'b'] },
				{ code: 'list-ba', tags: ['b', 'a'] },
			],
		})
		const codes = async (
			filter: Readonly<{ eq: readonly string[] } | { has: string }>,
		) =>
			(
				await Item.findMany({
					where: { tags: filter },
					orderBy: { code: 'asc' },
				})
			).map(({ code }) => code)

		await expect(codes({ eq: ['a'] })).resolves.toStrictEqual(['list-a'])
		await expect(codes({ eq: ['a', 'b'] })).resolves.toStrictEqual(['list-ab'])
		await expect(codes({ has: 'a' })).resolves.toStrictEqual([
			'list-a',
			'list-ab',
			'list-ba',
		])
	})

	it('stores and returns declared decimals exactly', async () => {
		const amount = '12345678901234567890.0123456789'
		const created = await Item.createOne({ data: { code: 'decimal', amount } })

		await expect(
			Item.findOne({ where: { id: { eq: created.id } } }),
		).resolves.toMatchObject({ amount })
	})

	it('loses no concurrent atomic update (ADR-0307)', async () => {
		const created = await Item.createOne({
			data: { code: 'counter', rank: 0, amount: '10.5' },
		})
		const where = { id: { eq: created.id } }

		await Promise.all(
			Array.from({ length: 8 }, (_, index) =>
				Item.updateOne({
					where,
					data:
						index % 2 === 0
							? { rank: { increment: 3 }, amount: { decrement: '0.25' } }
							: { rank: { decrement: 1 }, amount: { increment: '1.5' } },
				}),
			),
		)

		const stored = await Item.findOne({ where })
		expect(stored?.rank).toBe(8)
		expect(Number(stored?.amount)).toBe(15.5)
	})
})

describe(
	'automatic transaction retries on PostgreSQL (ADR-0300)',
	{ concurrent: false },
	() => {
		it('resolves a deadlock between two concurrent updates by replaying one', async () => {
			const debug = vi
				.spyOn(console, 'debug')
				.mockImplementation(() => undefined)
			try {
				const left = await Left.createOne({ data: {} })
				const right = await Right.createOne({ data: {} })
				partners.left = left.id
				partners.right = right.id

				const results = await Promise.all([
					Left.updateOne({
						where: { id: left.id },
						data: { touchPartner: true },
					}),
					Right.updateOne({
						where: { id: right.id },
						data: { touchPartner: true },
					}),
				])

				expect(results).toHaveLength(2)
				// The deadlock victim replays its whole transaction, hooks included.
				expect(hookRuns.left + hookRuns.right).toBe(3)
				expect(debug).toHaveBeenCalledWith(
					'[UltimaBase] Retrying automatic transaction after a transient conflict',
					expect.objectContaining({ attempt: 1, code: 'TRANSACTION_CONFLICT' }),
				)
				// Each committed attempt incremented its partner exactly once.
				await expect(
					Left.findOne({ where: { id: { eq: left.id } } }),
				).resolves.toMatchObject({ value: 1 })
				await expect(
					Right.findOne({ where: { id: { eq: right.id } } }),
				).resolves.toMatchObject({ value: 1 })
			} finally {
				debug.mockRestore()
			}
		})
	},
)
