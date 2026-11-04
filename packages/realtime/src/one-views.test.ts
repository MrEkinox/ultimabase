// A live read follows a `one` view (D-240) as it follows a `many` one: a
// write to its target's rows sends again the rows whose view changed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginTypes } from 'ultimabase'
import {
	allow,
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from 'ultimabase'
import type { LiveMessage, Realtime, RealtimeApi } from './index.ts'
import { realtime, realtimePlugin } from './index.ts'

const M = { as: master }

const Board = defineModel({
	name: 'Board',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		rounds: f.many(() => Round, { inverse: 'board' }),
		current: f.one(() => Round, { from: 'rounds' }),
	}),
}).with({
	access: allow.public,
	relations: { current: { where: ({ where }) => where({ open: true }) } },
})

const Round = defineModel({
	name: 'Round',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		open: f.boolean({ default: true }),
		board: f.one(() => Board),
	}),
	indexes: [{ fields: ['board'], unique: true, where: { open: true } }],
}).with({ access: allow.public })

interface Watching extends PluginTypes {
	readonly name: 'watching'
	readonly requires: Realtime
}
let api: RealtimeApi | undefined
const watching = definePlugin<Watching>({
	name: 'watching',
	manifest: {
		name: 'watching',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { realtime: realtimePlugin },
	api: ({ plugins }) => {
		api = plugins.realtime
	},
})

let app: ReturnType<typeof defineApp> | undefined
let ada = ''
let first = ''

/** Waits past the engine's gather. */
const quiet = async () => new Promise((done) => setTimeout(done, 100))

beforeEach(async () => {
	app = defineApp({
		database: memory(),
		models: [Board, Round],
		plugins: [realtimePlugin(), watching.plugin()],
	})
	await app.start()
	const created = await Board.create(
		{ data: { name: 'Ada', rounds: { create: [{ name: 'First' }] } } },
		M,
	)
	ada = created.id
	const [round] = await Round.findMany({}, M)
	first = round?.id ?? ''
	await Board.create({ data: { name: 'Bob' } }, M)
	await quiet()
})

afterEach(async () => {
	await app?.stop()
})

async function followed(): Promise<LiveMessage[]> {
	if (api === undefined) throw new Error('No realtime API.')
	const viewer = await api.connect(new Request('http://localhost/'))
	const seen: LiveMessage[] = []
	await viewer.list(
		'Board',
		{
			first: 10,
			orderBy: { name: 'asc' },
			select: { name: true, current: { select: { name: true } } },
		},
		(message) => seen.push(message),
	)
	await vi.waitFor(() => expect(seen).toHaveLength(1))
	return seen
}

describe('a live list showing a one view', () => {
	it('sends a row again when the row its view keeps changes', async () => {
		const seen = await followed()
		expect(seen[0]).toMatchObject({
			rows: [
				{ name: 'Ada', current: { name: 'First' } },
				{ name: 'Bob', current: null },
			],
		})
		await Round.update({ where: { id: first }, data: { open: false } }, M)
		await vi.waitFor(() => expect(seen).toHaveLength(2))
		expect(seen[1]).toMatchObject({
			changes: [{ upsert: { name: 'Ada', current: null } }],
		})
		await Round.create(
			{ data: { name: 'Second', board: { connect: { id: ada } } } },
			M,
		)
		await vi.waitFor(() => expect(seen).toHaveLength(3))
		expect(seen[2]).toMatchObject({
			changes: [{ upsert: { name: 'Ada', current: { name: 'Second' } } }],
		})
	})
})
