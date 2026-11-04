// `exists` (D-244): whether the caller reads a row `where` selects, by
// reading at most one, its `id`.
import { asUser } from '@ultimabase/testing'
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import type { Adapter, Read } from './index.ts'
import { defineApp, defineModel, master, memory, transaction } from './index.ts'

const M = { as: master }
const ada = { as: asUser({ id: 'ada' }) }

const Membership = defineModel({
	name: 'Membership',
	fields: (f) => ({
		user: f.string(),
		club: f.string(),
		hidden: f.boolean({ default: false }),
		left: f.boolean({ default: false }),
	}),
}).with({
	access: { read: ({ where }) => where({ hidden: false }) },
	hooks: { beforeFind: ({ where }) => where({ left: false }) },
})

describe('exists', () => {
	const reads: Read[] = []
	let app: ReturnType<typeof defineApp>
	beforeEach(async () => {
		reads.length = 0
		const base = memory()
		const database: Adapter = {
			...base,
			find: async (read) => {
				reads.push(read)
				return base.find(read)
			},
		}
		app = defineApp({ database, models: [Membership] })
		await app.start()
		await Membership.createMany(
			{
				data: [
					{ user: 'ada', club: 'chess' },
					{ user: 'ada', club: 'chess' },
					{ user: 'ada', club: 'go', hidden: true },
					{ user: 'ada', club: 'golf', left: true },
				],
			},
			M,
		)
	})
	afterEach(async () => app.stop())

	it('says whether a row matches, reading one id', async () => {
		const found = await Membership.exists(
			{ where: { user: 'ada', club: 'chess' } },
			ada,
		)
		expectTypeOf(found).toEqualTypeOf<boolean>()
		expect(found).toBe(true)
		expect(reads).toMatchObject([{ model: 'Membership', fields: [], take: 1 }])
		expect(await Membership.exists({ where: { club: 'bridge' } }, ada)).toBe(
			false,
		)
		expect(await Membership.exists({}, ada)).toBe(true)
		expect(await Membership.exists()).toBe(true)
	})

	it('keeps the rows the caller reads, as count does', async () => {
		const go = { where: { club: 'go' } }
		expect(await Membership.exists(go, ada)).toBe(false)
		expect(await Membership.count(go, ada)).toBe(0)
		expect(await Membership.exists(go, M)).toBe(true)
		// beforeFind applies to Master too.
		expect(await Membership.exists({ where: { club: 'golf' } }, M)).toBe(false)
	})

	it('reads in the open transaction', async () => {
		const chess = { where: { club: 'chess' } }
		await transaction(async () => {
			await Membership.deleteMany(chess, M)
			expect(await Membership.exists(chess, M)).toBe(false)
		})
	})

	it('refuses what count refuses', async () => {
		await expect(
			// @ts-expect-error -- exists takes only `where`.
			Membership.exists({ where: {}, take: 1 }, M),
		).rejects.toThrow('take')
		await expect(
			// @ts-expect-error -- not a field of Membership.
			Membership.exists({ where: { name: 'x' } }, M),
		).rejects.toThrow('name')
	})
})
