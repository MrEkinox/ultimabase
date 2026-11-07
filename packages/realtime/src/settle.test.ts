// A row the refill finds, which the rows a flush holds refuse, is read again
// from the store: those rows may be older than the refill's read (D-300).
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Caller, Logger, PluginTypes } from 'ultimabase'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from 'ultimabase'
import type { LiveMessage, Realtime, RealtimeApi } from './index.ts'
import { realtime, realtimePlugin } from './index.ts'
import { Loader } from './loader.ts'
import { Held } from './needs.ts'

const M = { as: master }
const idOf = (caller: Caller): string =>
	caller.kind === 'user' ? caller.user.id : ''

const Team = defineModel({
	name: 'Team',
	fields: (f) => ({
		name: f.string(),
		members: f.many(() => Member, { inverse: 'team' }),
		posts: f.many(() => Post, { inverse: 'team' }),
	}),
})
const Member = defineModel({
	name: 'Member',
	fields: (f) => ({ user: f.string(), team: f.one(() => Team) }),
})
const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		rank: f.number({ integer: true }),
		team: f.one(() => Team),
	}),
	use: [realtime()],
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where({ team: { is: { members: { some: { user: idOf(caller) } } } } }),
	},
})

const errors: unknown[] = []
const logger: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: (first: string | object, message?: string) => {
		errors.push(message ?? first)
	},
	child: () => logger,
}
interface Following extends PluginTypes {
	readonly name: 'following'
	readonly requires: Realtime
}
let api: RealtimeApi | undefined
const following = definePlugin<Following>({
	name: 'following',
	manifest: {
		name: 'following',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { realtime: realtimePlugin },
	api: ({ plugins }) => {
		api = plugins.realtime
	},
	identify: async (request) => {
		const id = request.headers.get('authorization')
		return id === null ? undefined : asUser({ id })
	},
})

let app: ReturnType<typeof defineApp>
beforeEach(async () => {
	errors.length = 0
	app = defineApp({
		database: memory(),
		models: [Team, Member, Post],
		plugins: [realtimePlugin(), following.plugin()],
		logger,
	})
	await app.start()
})
afterEach(async () => {
	vi.restoreAllMocks()
	await app.stop()
})

/** The ids a client's copy of a live list shows, which each message changes. */
function copyOf(): {
	readonly ids: string[]
	readonly take: (message: LiveMessage) => void
} {
	const ids: string[] = []
	const take = (message: LiveMessage) => {
		if (message.kind === 'reset')
			ids.splice(0, ids.length, ...message.rows.map(({ id }) => id))
		if (message.kind !== 'changes') return
		for (const change of message.changes) {
			if ('remove' in change) {
				ids.splice(ids.indexOf(change.remove), 1)
				continue
			}
			ids.splice(ids.indexOf(change.after ?? '') + 1, 0, change.upsert.id)
		}
	}
	return { ids, take }
}

it('keeps a row the flush holds too old a right to', async () => {
	const team = await Team.create({ data: { name: 'a' } }, M)
	const connect = { connect: { id: team.id } }
	await Member.create({ data: { user: 'ada', team: connect } }, M)
	const posts = await Post.createManyAndReturn(
		{
			data: [1, 2, 3].map((rank) => ({
				title: `p${rank}`,
				rank,
				team: connect,
			})),
		},
		M,
	)
	const realtimeApi = api
	if (realtimeApi === undefined) throw new Error('No realtime API.')
	const viewer = await realtimeApi.connect(
		new Request('http://localhost/', { headers: { authorization: 'ada' } }),
	)
	const copy = copyOf()
	await viewer.list(
		'Post',
		{ orderBy: [{ rank: 'asc' }], first: 2, select: { title: true } },
		copy.take,
	)
	const [first, second, third] = posts.map(({ id }) => id)
	await vi.waitFor(() => {
		expect(copy.ids).toEqual([first, second])
	})
	// Once the creations' flush is over, the next holds the team as it was
	// before Ada joined.
	const asked = vi.spyOn(Loader.prototype, 'holding')
	for (let known = -1; known !== asked.mock.calls.length;) {
		known = asked.mock.calls.length
		await new Promise((done) => setTimeout(done, 150))
	}
	asked.mockImplementation(
		async (_model, _key, ids) => new Map(ids.map((id) => [id, new Held([])])),
	)
	await Post.delete({ where: { id: first ?? '' } }, M)
	await vi.waitFor(() => {
		expect(copy.ids).toEqual([second, third])
	})
	expect(errors).toEqual([])
})
