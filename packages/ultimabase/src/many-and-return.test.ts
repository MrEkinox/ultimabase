// `createManyAndReturn` and `updateManyAndReturn` (D-149): the rows the bulk
// write wrote, each as `create` or `update` returns it, all or nothing.
import { asUser } from '@ultimabase/testing'
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
import { query } from './engine.ts'

const M = { as: master }
const me = '00000000-0000-4000-8000-000000000000'
const user = { as: asUser({ id: me }) }

/** A user reads the cards that are not hidden, and their owner only. */
const Card = defineModel({
	name: 'Card',
	fields: (f) => ({
		text: f.string(),
		hidden: f.boolean({ default: false }),
		owner: f.string({ default: me }).with({
			access: { read: ({ caller }) => caller.kind === 'master' },
		}),
		score: f.number({ integer: true, default: 0 }),
		deck: f.one(() => Deck, { optional: true }),
	}),
}).with({
	access: {
		read: ({ where }) => where({ hidden: false }),
		create: () => true,
		update: () => true,
	},
	hooks: {
		// A hook that writes the row again, which the rows returned show (D-88).
		afterCreate: async ({ record }) => {
			if (record.text !== 'bump') return
			await Card.update({ where: { id: record.id }, data: { score: 9 } }, M)
		},
		afterUpdate: async ({ record }) => {
			if (record.text !== 'bump' || record.score === 9) return
			await Card.update({ where: { id: record.id }, data: { score: 9 } }, M)
		},
	},
})

const Deck = defineModel({
	name: 'Deck',
	fields: (f) => ({
		name: f.string(),
		cards: f.many(() => Card),
		tallies: f.many(() => Tally),
	}),
}).with({ access: { read: () => true } })

/** No rule, no hook: Master's update is one UPDATE (D-133). */
const Tally = defineModel({
	name: 'Tally',
	fields: (f) => ({
		name: f.string(),
		count: f.number({ integer: true }),
		deck: f.one(() => Deck, { optional: true }),
	}),
})

// Never called: checks the rows' types.
async function typed() {
	const made = await Card.createManyAndReturn(
		{ data: [{ text: 'a' }], select: { text: true } },
		M,
	)
	expectTypeOf(made).toEqualTypeOf<{ readonly text: string }[]>()
	const changed = await Card.updateManyAndReturn(
		{ data: { score: 1 }, omit: { owner: true, hidden: true } },
		M,
	)
	expectTypeOf(changed[0]?.score).toEqualTypeOf<number | undefined>()
	// @ts-expect-error -- omit leaves owner out
	expectTypeOf(changed[0]?.owner).toBeString()
	await Card.createManyAndReturn(
		// @ts-expect-error -- select and omit exclude each other
		{ data: [], select: { text: true }, omit: { text: true } },
		M,
	)
	// @ts-expect-error -- no where on a create
	await Card.createManyAndReturn({ data: [], where: {} }, M)
}

describe('createManyAndReturn and updateManyAndReturn', () => {
	let app: ReturnType<typeof defineApp>
	beforeEach(async () => {
		app = defineApp({ database: memory(), models: [Card, Deck, Tally] })
		await app.start()
	})
	afterEach(async () => app.stop())

	it('returns the rows created in the order of data, as create does', async () => {
		const deck = await Deck.create({ data: { name: 'd' } }, M)
		const data = [
			{ text: 'c', deck: { connect: { id: deck.id } } },
			{ text: 'bump' },
			{ text: 'a', hidden: true },
		]
		const rows = await Card.createManyAndReturn(
			{ data, select: { text: true, score: true, deck: true } },
			user,
		)
		expect(rows).toStrictEqual([
			{
				text: 'c',
				score: 0,
				deck: {
					id: deck.id,
					name: 'd',
					createdAt: deck.createdAt,
					updatedAt: deck.updatedAt,
				},
			},
			{ text: 'bump', score: 9, deck: null },
			{ text: 'a', score: 0, deck: null },
		])
		const all = await Card.createManyAndReturn({ data: { text: 'x' } }, user)
		expect(all).toMatchObject([{ text: 'x', hidden: false, score: 0 }])
		expect(Object.keys(all[0] ?? {})).not.toContain('owner')
		const kept = await Card.createManyAndReturn(
			{ data: [{ text: 'y' }], omit: { id: true, createdAt: true } },
			M,
		)
		expect(kept.map((row) => Object.keys(row).toSorted())).toEqual([
			['hidden', 'owner', 'score', 'text', 'updatedAt'],
		])
		expect(await Card.createManyAndReturn({ data: [] }, M)).toEqual([])
		expectTypeOf(typed).toBeFunction()
		expectTypeOf<{
			data: { text: string }
			include: { deck: true }
		}>().toExtend<ArgsOf<typeof Card, 'createManyAndReturn'>>()
	})

	it('returns the rows updated in id order, through the rules and hooks', async () => {
		const deck = await Deck.create({ data: { name: 'd' } }, M)
		const texts = ['b', 'bump', 'a', 'z']
		for (const text of texts) {
			await Card.create(
				{ data: { text, deck: { connect: { id: deck.id } } } },
				M,
			)
		}
		const rows = await Card.updateManyAndReturn(
			{
				where: { text: { not: 'z' } },
				data: { score: { increment: 1 } },
				select: { text: true, score: true, deck: { select: { name: true } } },
			},
			user,
		)
		expect(rows).toStrictEqual([
			{ text: 'b', score: 1, deck: { name: 'd' } },
			{ text: 'bump', score: 9, deck: { name: 'd' } },
			{ text: 'a', score: 1, deck: { name: 'd' } },
		])
		// The row written comes back even when the caller cannot read it.
		const hid = await Card.updateManyAndReturn(
			{ where: { text: 'a' }, data: { hidden: true }, select: { text: true } },
			user,
		)
		expect(hid).toStrictEqual([{ text: 'a' }])
		const none = { where: { text: 'none' }, data: { score: 1 } }
		expect(await Card.updateManyAndReturn(none, user)).toEqual([])
	})

	it('returns the rows of one UPDATE, as it left them', async () => {
		const deck = await Deck.create({ data: { name: 'd' } }, M)
		for (const [name, count] of [
			['b', 1],
			['a', 2],
			['c', 3],
		] as const) {
			await Tally.create(
				{ data: { name, count, deck: { connect: { id: deck.id } } } },
				M,
			)
		}
		const where = { name: { in: ['a', 'b'] } }
		const data = { count: { multiply: 10 } }
		const rows = await Tally.updateManyAndReturn(
			{ where, data, select: { name: true, count: true } },
			M,
		)
		expect(rows).toStrictEqual([
			{ name: 'b', count: 10 },
			{ name: 'a', count: 20 },
		])
		const included = await Tally.updateManyAndReturn(
			{ where, data, include: { deck: true }, omit: { id: true } },
			M,
		)
		expect(included).toMatchObject([
			{ name: 'b', count: 100, deck: { name: 'd' } },
			{ name: 'a', count: 200, deck: { name: 'd' } },
		])
		const counted = await Deck.updateManyAndReturn(
			{ data: { name: 'e' }, select: { name: true, _count: true } },
			M,
		)
		expect(counted).toStrictEqual([
			{ name: 'e', _count: { cards: 0, tallies: 3 } },
		])
	})

	it('refuses a shape it does not take, before it writes', async () => {
		await expect(
			query(
				'Card',
				'createManyAndReturn',
				{ data: [{ text: 'a' }], take: 1 },
				M,
			),
		).rejects.toMatchObject({ code: 'INVALID_QUERY' })
		await expect(
			query(
				'Card',
				'updateManyAndReturn',
				{ data: { score: 1 }, select: { nope: true } },
				M,
			),
		).rejects.toMatchObject({ code: 'INVALID_QUERY' })
		expect(await Card.count({}, M)).toBe(0)
	})
})
