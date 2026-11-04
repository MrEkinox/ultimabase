// A live read follows a `one` view (D-240) and an `exists` (D-246) as it
// follows a `many` one: a write to its target's rows sends again the rows
// whose view changed, and a view that pins the viewer follows each caller's
// own row (D-245).
import { asUser } from '@ultimabase/testing'
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

const users = definePlugin({ name: 'users', userModel: true })

// A variable, so no excess property check: without `Register`, no filter
// takes `viewer` (D-189 point 5).
const mine = { viewer: true, isNot: undefined }

const Account = defineModel({
	name: 'Account',
	use: [users.use()],
	fields: (f) => ({ votes: f.many(() => Vote, { inverse: 'user' }) }),
}).with({ access: allow.public })

const Board = defineModel({
	name: 'Board',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		rounds: f.many(() => Round, { inverse: 'board' }),
		current: f.one(() => Round, { from: 'rounds' }),
		votes: f.many(() => Vote, { inverse: 'board' }),
		myVote: f.one(() => Vote, { from: 'votes' }),
		hasVoted: f.exists(() => Vote, { from: 'votes' }),
	}),
}).with({
	access: allow.public,
	relations: {
		current: { where: ({ where }) => where({ open: true }) },
		myVote: { where: ({ where }) => where({ user: mine }) },
		hasVoted: { where: ({ where }) => where({ user: mine }) },
	},
})

const Vote = defineModel({
	name: 'Vote',
	use: [realtime()],
	fields: (f) => ({
		score: f.number(),
		board: f.one(() => Board),
		user: f.one(() => Account),
	}),
	indexes: [{ fields: ['board', 'user'], unique: true }],
}).with({ access: allow.public })

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
	// A request's `authorization` names its user.
	identify: async (request) => {
		const id = request.headers.get('authorization')
		return id === null ? undefined : asUser({ id })
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
		models: [Account, Board, Round, Vote],
		plugins: [users.plugin(), realtimePlugin(), watching.plugin()],
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

/** The messages of a live list of boards, read with `args`, as `user`. */
async function voted(
	user?: string,
	args: object = {
		select: { name: true, myVote: { select: { score: true } } },
	},
): Promise<LiveMessage[]> {
	if (api === undefined) throw new Error('No realtime API.')
	const headers: Record<string, string> =
		user === undefined ? {} : { authorization: user }
	const viewer = await api.connect(
		new Request('http://localhost/', { headers }),
	)
	const seen: LiveMessage[] = []
	await viewer.list(
		'Board',
		{ first: 10, orderBy: { name: 'asc' }, ...args },
		(message) => seen.push(message),
	)
	await vi.waitFor(() => expect(seen).toHaveLength(1))
	return seen
}

const vote = async (user: string, score: number) =>
	Vote.create(
		{
			data: {
				score,
				board: { connect: { id: ada } },
				user: { connect: { id: user } },
			},
		},
		M,
	)

describe('a live list showing a one view that pins the viewer', () => {
	it('follows each caller’s own row', async () => {
		const ann = (await Account.create({ data: {} }, M)).id
		const ben = (await Account.create({ data: {} }, M)).id
		await vote(ben, 1)
		await quiet()
		const [anns, bens, nobody] = [
			await voted(ann),
			await voted(ben),
			await voted(),
		]
		expect(anns[0]).toMatchObject({
			rows: [
				{ name: 'Ada', myVote: null },
				{ name: 'Bob', myVote: null },
			],
		})
		expect(bens[0]).toMatchObject({
			rows: [{ name: 'Ada', myVote: { score: 1 } }, { myVote: null }],
		})
		await vote(ann, 2)
		await vi.waitFor(() => expect(anns).toHaveLength(2))
		expect(anns[1]).toMatchObject({
			changes: [{ upsert: { name: 'Ada', myVote: { score: 2 } } }],
		})
		await Vote.updateMany({ where: {}, data: { score: 3 } }, M)
		// A write to a link sends its rows again, changed or not (D-154).
		await vi.waitFor(() =>
			expect(bens.at(-1)).toMatchObject({
				changes: [{ upsert: { name: 'Ada', myVote: { score: 3 } } }],
			}),
		)
		await quiet()
		// A caller that is no user reads none, whatever the votes.
		const sent = JSON.stringify(nobody)
		expect(sent).not.toContain('score')
		expect(nobody[0]).toMatchObject({
			rows: [{ myVote: null }, { myVote: null }],
		})
	})
})

describe('a live list of an exists that pins the viewer', () => {
	it('sends a row again when its exists changes, and follows its filter', async () => {
		const ann = (await Account.create({ data: {} }, M)).id
		const shown = await voted(ann, { select: { name: true, hasVoted: true } })
		const kept = await voted(ann, {
			where: { hasVoted: true },
			select: { name: true },
		})
		expect(shown[0]).toMatchObject({
			rows: [
				{ name: 'Ada', hasVoted: false },
				{ name: 'Bob', hasVoted: false },
			],
		})
		expect(kept[0]).toMatchObject({ rows: [] })
		await vote(ann, 1)
		await vi.waitFor(() => expect(shown).toHaveLength(2))
		// A `one` or `many` view sends Bob again too, unchanged.
		const row: unknown = expect.objectContaining({
			name: 'Ada',
			hasVoted: true,
		})
		const upsert: unknown = expect.objectContaining({ upsert: row })
		const changes: unknown = expect.arrayContaining([upsert])
		expect(shown[1]).toMatchObject({ changes })
		await vi.waitFor(() => expect(kept).toHaveLength(2))
		expect(kept[1]).toMatchObject({ changes: [{ upsert: { name: 'Ada' } }] })
	})
})
