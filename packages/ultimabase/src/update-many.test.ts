// `updateMany` (D-133): an update's rules, validation and hooks on each row
// its `where` selects, in id order, all or nothing.
import { asUser } from '@ultimabase/testing'
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import { z } from 'zod'
import type { ArgsOf, Caller } from './index.ts'
import { defineApp, defineModel, master, memory } from './index.ts'

const M = { as: master }
const me = '00000000-0000-4000-8000-000000000000'
const other = '11111111-1111-4111-8111-111111111111'
const user = { as: asUser({ id: me }) }
const log: string[] = []
let failing: string | undefined
let linking: string | undefined

const mine = ({
	caller,
	record,
}: {
	caller: Caller
	record: { owner: string }
}) => caller.kind === 'user' && caller.user.id === record.owner

/** Rows a user reads, and updates only when they own them. */
const Memo = defineModel({
	name: 'Memo',
	fields: (f) => ({
		text: f.string({ validate: z.string().min(1) }),
		owner: f.string(),
		hidden: f.boolean({ default: false }),
		score: f.number({ integer: true, default: 0 }),
		lines: f.many(() => Line),
	}),
}).with({
	access: { read: ({ where }) => where({ hidden: false }), update: mine },
	hooks: {
		beforeUpdate: ({ record, data }) => {
			log.push(`beforeUpdate ${record.text} ${String(data.score)}`)
			if (failing === record.text) throw new Error(`${record.text} failed.`)
			if (record.text === 'loud') data.text = 'LOUD'
			if (record.text === 'top') data.score = 100
			if (record.text === 'linked' && linking !== undefined) {
				data.lines = { connect: [{ id: linking }] }
			}
		},
		afterUpdate: ({ record }) => {
			log.push(`afterUpdate ${record.text}`)
		},
		afterUpdateCommit: ({ record }) => {
			log.push(`afterUpdateCommit ${record.text}`)
		},
	},
})

const Line = defineModel({
	name: 'Line',
	fields: (f) => ({
		text: f.string(),
		memo: f.one(() => Memo, { optional: true }),
	}),
})

/** No hook, no rule: Master's updateMany is one write (D-133). */
const Tally = defineModel({
	name: 'Tally',
	fields: (f) => ({
		name: f.string({ unique: true }),
		count: f.number({ integer: true }),
	}),
})

const memo = async (text: string, owner = me, hidden = false, score = 0) =>
	Memo.create({ data: { text, owner, hidden, score } }, M)
const texts = async () =>
	(await Memo.findMany({ orderBy: { text: 'asc' } }, M)).map(
		(row) => `${row.text} ${row.score}`,
	)

describe('updateMany', () => {
	let app: ReturnType<typeof defineApp>
	beforeEach(async () => {
		log.length = 0
		failing = undefined
		linking = undefined
		app = defineApp({ database: memory(), models: [Memo, Line, Tally] })
		await app.start()
	})
	afterEach(async () => app.stop())

	it('runs the hooks of each row in id order, each on its own data', async () => {
		await memo('b', me, false, 1)
		await memo('loud', me, false, 2)
		await memo('c')
		const where = { text: { in: ['b', 'loud'] } }
		const data = { text: 'quiet', score: { increment: 1 } }
		expect(await Memo.updateMany({ where, data }, user)).toEqual({ count: 2 })
		expect(log).toEqual([
			'beforeUpdate b 2',
			'beforeUpdate loud 3',
			'afterUpdate quiet',
			'afterUpdate LOUD',
			'afterUpdateCommit quiet',
			'afterUpdateCommit LOUD',
		])
		expect(await texts()).toEqual(['LOUD 3', 'c 0', 'quiet 2'])
	})

	it('computes a number on each row, unless a hook set it', async () => {
		await memo('a', me, false, 1)
		await memo('b', me, false, 5)
		await memo('top', me, false, 7)
		const data = { score: { multiply: 2 } }
		expect(await Memo.updateMany({ data }, user)).toEqual({ count: 3 })
		expect(await texts()).toEqual(['a 2', 'b 10', 'top 100'])
	})

	it('plans alone a row whose hook writes a relation', async () => {
		const line = await Line.create({ data: { text: 'l' } }, M)
		linking = line.id
		await memo('linked')
		await memo('plain')
		const data = { hidden: false }
		expect(await Memo.updateMany({ data }, user)).toEqual({ count: 2 })
		expect(await Line.findMany({ include: { memo: true } }, M)).toMatchObject([
			{ memo: { text: 'linked' } },
		])
	})

	it('updates nothing when the rule refuses one row', async () => {
		await memo('a')
		await memo('b', other)
		const data = { text: 'x' }
		await expect(Memo.updateMany({ data }, user)).rejects.toMatchObject({
			code: 'ACCESS_DENIED',
		})
		expect(await texts()).toEqual(['a 0', 'b 0'])
		expect(log).toEqual([])
	})

	it('updates nothing when a hook fails on one row', async () => {
		await memo('a')
		await memo('b')
		failing = 'b'
		const data = { text: 'x' }
		await expect(Memo.updateMany({ data }, user)).rejects.toThrow('b failed.')
		expect(await texts()).toEqual(['a 0', 'b 0'])
	})

	it('validates the data before any hook', async () => {
		await memo('a')
		const data = { text: '' }
		await expect(Memo.updateMany({ data }, user)).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
		})
		expect(log).toEqual([])
	})

	it('leaves out the rows the caller cannot read', async () => {
		await memo('a')
		await memo('secret', me, true)
		const data = { score: 1 }
		expect(await Memo.updateMany({ data }, user)).toEqual({ count: 1 })
		expect(await texts()).toEqual(['a 1', 'secret 0'])
		const where = { text: 'none' }
		expect(await Memo.updateMany({ where, data }, user)).toEqual({ count: 0 })
	})

	it('refuses a relation write, and a key it does not take', async () => {
		await memo('a')
		const line = await Line.create({ data: { text: 'l' } }, M)
		const data: unknown = { lines: { connect: [{ id: line.id }] } }
		const call: unknown = Reflect.apply(Memo.updateMany, undefined, [
			{ data },
			M,
		])
		await expect(call).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			message: 'data.lines is a relation, which updateMany does not write.',
		})
		const args: unknown = { data: {}, take: 1 }
		const taking: unknown = Reflect.apply(Memo.updateMany, undefined, [args, M])
		await expect(taking).rejects.toMatchObject({ code: 'INVALID_QUERY' })
		const unknown: unknown = Reflect.apply(Memo.updateMany, undefined, [
			{ data: { color: 'red' } },
			M,
		])
		await expect(unknown).rejects.toMatchObject({ code: 'INVALID_QUERY' })
	})

	it('writes every row at once when nothing needs them', async () => {
		await Tally.create({ data: { name: 'a', count: 1 } }, M)
		await Tally.create({ data: { name: 'b', count: 2 } }, M)
		const data = { count: { increment: 10 } }
		expect(await Tally.updateMany({ data }, M)).toEqual({ count: 2 })
		const where = { name: 'b' }
		expect(await Tally.updateMany({ where, data }, M)).toEqual({ count: 1 })
		const counts = await Tally.findMany({ orderBy: { name: 'asc' } }, M)
		expect(counts.map((row) => row.count)).toEqual([11, 22])
		expect(await Tally.updateMany({ where: { name: 'z' }, data }, M)).toEqual({
			count: 0,
		})
		await expect(
			Tally.updateMany({ data: { count: { multiply: 2 ** 30 } } }, M),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
		await expect(
			Tally.updateMany({ data: { name: 'same' } }, M),
		).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
		expect(counts).toEqual(
			await Tally.findMany({ orderBy: { name: 'asc' } }, M),
		)
	})

	it('takes the scalar data of update, without relations', () => {
		type Args = ArgsOf<typeof Memo, 'updateMany'>
		expectTypeOf<{ data: { score: { increment: 1 } } }>().toExtend<Args>()
		expectTypeOf<{ where: { owner: string }; data: {} }>().toExtend<Args>()
		expectTypeOf<{ data: { lines: { connect: [] } } }>().not.toExtend<Args>()
		expectTypeOf<{ where: {} }>().not.toExtend<Args>()
		expectTypeOf(Memo.updateMany).returns.resolves.toEqualTypeOf<{
			readonly count: number
		}>()
		// @ts-expect-error -- no relation write on many rows (D-133)
		void Memo.updateMany({ data: { lines: { connect: [] } } }, M).catch(
			() => undefined,
		)
	})
})
