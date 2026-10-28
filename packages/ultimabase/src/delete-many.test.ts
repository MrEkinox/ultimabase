// `deleteMany` (D-111): a delete's rules, hooks, trash and cascades on each
// row its `where` selects, all or nothing.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asUser } from '@ultimabase/testing'
import type { Caller, Field, PluginTypes } from './index.ts'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'
import type { Queries } from './query.ts'

const M = { as: master }
const me = '00000000-0000-4000-8000-000000000000'
const user = { as: asUser({ id: me }) }
const log: string[] = []
let failing: string | undefined

const mine = ({
	caller,
	record,
}: {
	caller: Caller
	record: { owner: string }
}) => caller.kind === 'user' && caller.user.id === record.owner

/** Rows a user reads, and deletes only when they own them. */
const Memo = defineModel({
	name: 'Memo',
	fields: (f) => ({
		text: f.string(),
		owner: f.string(),
		hidden: f.boolean({ default: false }),
		lines: f.many(() => Line),
	}),
}).with({
	access: { read: ({ where }) => where({ hidden: false }), delete: mine },
	hooks: {
		beforeDelete: ({ record }) => {
			log.push(`beforeDelete ${record.text}`)
			if (failing === record.text) throw new Error(`${record.text} failed.`)
		},
		afterDelete: ({ record }) => {
			log.push(`afterDelete ${record.text}`)
		},
		afterDeleteCommit: ({ record }) => {
			log.push(`afterDeleteCommit ${record.text}`)
		},
	},
})

const Line = defineModel({
	name: 'Line',
	fields: (f) => ({
		text: f.string(),
		memo: f.one(() => Memo, { onDelete: 'cascade' }),
	}),
}).with({
	hooks: {
		beforeDelete: ({ record }) => {
			log.push(`beforeDelete line ${record.text}`)
		},
	},
})

interface TrashCommands<F> {
	readonly trash: Queries<F>
}
interface Trash extends PluginTypes {
	readonly name: 'trash'
	readonly addedFields: {
		readonly trashedAt: Field<Date, { readonly optional: true }>
	}
	readonly commands: TrashCommands<this['fields']>
}
const trash = definePlugin<Trash>({
	name: 'trash',
	manifest: {
		name: 'trash',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	addedFields: (f) => ({ trashedAt: f.dateTime({ optional: true }) }),
	redirect: {
		delete: async ({ where, queries }) =>
			queries.update({ where, data: { trashedAt: new Date() } }, M),
	},
	hooks: {
		beforeFind: ({ where, command }) =>
			where({ trashedAt: command === 'trash' ? { not: null } : null }),
	},
	commands: ({ queries }) => ({ trash: queries }),
})

const Draft = defineModel({
	name: 'Draft',
	use: [trash.use()],
	fields: (f) => ({ title: f.string() }),
})

const memo = async (text: string, owner = me, hidden = false) =>
	Memo.create({ data: { text, owner, hidden } }, M)

describe('deleteMany', () => {
	let app: ReturnType<typeof defineApp>
	beforeEach(async () => {
		log.length = 0
		failing = undefined
		app = defineApp({
			database: memory(),
			plugins: [trash.plugin()],
			models: [Memo, Line, Draft],
		})
		await app.start()
	})
	afterEach(async () => app.stop())

	it('runs the hooks of each row and of what it reaches, the deepest first', async () => {
		const a = await memo('a')
		await memo('b')
		await memo('c')
		await Line.create(
			{ data: { text: 'a1', memo: { connect: { id: a.id } } } },
			M,
		)
		const where = { text: { in: ['a', 'b'] } }
		expect(await Memo.deleteMany({ where }, user)).toEqual({ count: 2 })
		expect(log).toEqual([
			'beforeDelete line a1',
			'beforeDelete a',
			'beforeDelete b',
			'afterDelete a',
			'afterDelete b',
			'afterDeleteCommit a',
			'afterDeleteCommit b',
		])
		const left = await Memo.findMany({}, M)
		expect(left.map((row) => row.text)).toEqual(['c'])
		expect(await Line.count({}, M)).toBe(0)
	})

	it('deletes nothing when the rule refuses one row', async () => {
		await memo('a')
		await memo('b', '11111111-1111-4111-8111-111111111111')
		await expect(Memo.deleteMany({}, user)).rejects.toMatchObject({
			code: 'ACCESS_DENIED',
		})
		expect(await Memo.count({}, M)).toBe(2)
		expect(log).toEqual([])
	})

	it('deletes nothing when a hook fails on one row', async () => {
		await memo('a')
		await memo('b')
		failing = 'b'
		await expect(Memo.deleteMany({}, user)).rejects.toThrow('b failed.')
		expect(await Memo.count({}, M)).toBe(2)
	})

	it('leaves out the rows the caller cannot read', async () => {
		await memo('a')
		await memo('secret', me, true)
		expect(await Memo.deleteMany({}, user)).toEqual({ count: 1 })
		expect(await Memo.findMany({}, M)).toMatchObject([{ text: 'secret' }])
		expect(await Memo.deleteMany({}, user)).toEqual({ count: 0 })
	})

	it('redirects each row to the trash', async () => {
		await Draft.create({ data: { title: 'one' } }, M)
		await Draft.create({ data: { title: 'two' } }, M)
		expect(await Draft.deleteMany({}, M)).toEqual({ count: 2 })
		expect(await Draft.count({}, M)).toBe(0)
		expect(await Draft.trash.count({}, M)).toBe(2)
		// Rows in the trash are not deleted again.
		expect(await Draft.deleteMany({}, M)).toEqual({ count: 0 })
	})

	it('deletes every row without a where, ignoring an undefined one', async () => {
		await memo('a')
		await memo('b')
		expect(await Memo.deleteMany({ where: undefined }, M)).toEqual({
			count: 2,
		})
		await memo('c')
		expect(await Memo.deleteMany(undefined, M)).toEqual({ count: 1 })
	})

	it('refuses a key it does not take', async () => {
		const args: unknown = { where: {}, take: 1 }
		const call: unknown = Reflect.apply(Memo.deleteMany, undefined, [args, M])
		await expect(call).rejects.toMatchObject({ code: 'INVALID_QUERY' })
	})
})
