// A flush does not wait for a big live list reading its window (D-254): others'
// messages arrive while it reads, and its own follow once it has.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { PluginTypes } from 'ultimabase'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from 'ultimabase'
import type { LiveMessage, Realtime, RealtimeApi } from './index.ts'
import { realtime, realtimePlugin } from './index.ts'

const M = { as: master }
/** While set, reading a big list's rows waits for it. */
let held: Promise<void> | undefined
const Item = defineModel({
	name: 'Item',
	fields: (f) => ({
		rank: f.number({ integer: true }),
		slow: f.virtual(z.int(), { needs: [] }),
	}),
	use: [realtime()],
}).with({
	access: { read: () => true },
	virtuals: {
		slow: {
			run: async ({ caller }) => {
				if (caller.kind !== 'master') await held
				return 1
			},
		},
	},
})
const Other = defineModel({
	name: 'Other',
	fields: (f) => ({ name: f.string() }),
	use: [realtime()],
}).with({ access: { read: () => true } })

let api: RealtimeApi | undefined
interface Running extends PluginTypes {
	readonly name: 'running'
	readonly requires: Realtime
}
const running = definePlugin<Running>({
	name: 'running',
	manifest: {
		name: 'running',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { realtime: realtimePlugin },
	api: ({ plugins: { realtime: live } }) => {
		api = live
	},
})
const app = defineApp({
	database: memory(),
	models: [Item, Other],
	plugins: [
		realtimePlugin({ maxLive: 100_000, maxConnectionRows: 100_000 }),
		running.plugin(),
	],
})

const viewer = async () => {
	if (api === undefined) throw new Error('Not started.')
	return api.connect(new Request('http://localhost/'))
}

beforeEach(async () => {
	held = undefined
	await app.start()
	await Item.createMany(
		{ data: Array.from({ length: 1000 }, (_, rank) => ({ rank })) },
		M,
	)
})

afterEach(async () => {
	held = undefined
	await app.stop()
})

const opened = () => {
	const { promise: gate, resolve: open } = Promise.withResolvers<void>()
	return { gate, open }
}

describe('a big live list reading its window', () => {
	it('holds no other list back, and follows what it missed after', async () => {
		const other = await Other.create({ data: { name: 'a' } }, M)
		const quiet: LiveMessage[] = []
		await (
			await viewer()
		).list('Other', { orderBy: [{ name: 'asc' }], first: 5 }, (message) => {
			quiet.push(message)
		})

		const { gate, open } = opened()
		held = gate
		const big: LiveMessage[] = []
		const listed = (await viewer()).list(
			'Item',
			{
				orderBy: [{ rank: 'asc' }],
				first: 1000,
				select: { rank: true, slow: true },
			},
			(message) => {
				big.push(message)
			},
		)
		await vi.waitFor(() => {
			expect(held).toBeDefined()
		})

		quiet.length = 0
		const moved = await Item.create({ data: { rank: -1 } }, M)
		await Other.update({ where: { id: other.id }, data: { name: 'b' } }, M)
		await vi.waitFor(() => {
			expect(quiet.map(({ kind }) => kind)).toEqual(['changes'])
		})
		// The flush after it: flushes run one after another.
		await Other.update({ where: { id: other.id }, data: { name: 'c' } }, M)
		await vi.waitFor(() => {
			expect(quiet.map(({ kind }) => kind)).toEqual(['changes', 'changes'])
		})
		expect(big).toEqual([])

		held = undefined
		open()
		await listed
		await vi.waitFor(() => {
			expect(big.map(({ kind }) => kind)).toEqual(['reset', 'changes'])
		})
		const [, changes] = big
		const placed =
			changes?.kind === 'changes'
				? changes.changes.flatMap((change) =>
						'upsert' in change ? [change.upsert] : [],
					)
				: []
		expect(placed.map(({ id }) => id)).toEqual([moved.id])
	})
})
