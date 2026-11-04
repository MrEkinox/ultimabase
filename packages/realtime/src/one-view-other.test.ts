// A live read follows a `one` view on the other row of a pair (D-249): each
// connection reads the other member of its own pairs, and a member joining or
// leaving sends the rows again.
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
const theirs = { viewer: false, is: undefined }

const Account = defineModel({
	name: 'Account',
	use: [users.use(), realtime()],
	fields: (f) => ({ name: f.string() }),
}).with({ access: allow.public })

const Chat = defineModel({
	name: 'Chat',
	use: [realtime()],
	fields: (f) => ({
		title: f.string(),
		members: f.many(() => Member, { inverse: 'chat', size: { max: 2 } }),
		otherMember: f.one(() => Member, { from: 'members' }),
	}),
}).with({
	access: allow.public,
	relations: {
		otherMember: { where: ({ where }) => where({ user: theirs }) },
	},
})

const Member = defineModel({
	name: 'Member',
	use: [realtime()],
	fields: (f) => ({
		chat: f.one(() => Chat, { onDelete: 'cascade' }),
		user: f.one(() => Account),
	}),
	indexes: [{ fields: ['chat', 'user'], unique: true }],
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
let bob = ''
let chat = ''

/** Waits past the engine's gather. */
const quiet = async () => new Promise((done) => setTimeout(done, 100))

beforeEach(async () => {
	app = defineApp({
		database: memory(),
		models: [Account, Chat, Member],
		plugins: [users.plugin(), realtimePlugin(), watching.plugin()],
	})
	await app.start()
	ada = (await Account.create({ data: { name: 'Ada' } }, M)).id
	bob = (await Account.create({ data: { name: 'Bob' } }, M)).id
	chat = (
		await Chat.create(
			{
				data: {
					title: 'Duo',
					members: { create: [{ user: { connect: { id: ada } } }] },
				},
			},
			M,
		)
	).id
	await quiet()
})

afterEach(async () => {
	await app?.stop()
})

/** The messages of a live list of chats, as `user`. */
async function followed(user: string): Promise<LiveMessage[]> {
	if (api === undefined) throw new Error('No realtime API.')
	const viewer = await api.connect(
		new Request('http://localhost/', { headers: { authorization: user } }),
	)
	const seen: LiveMessage[] = []
	await viewer.list(
		'Chat',
		{
			first: 10,
			orderBy: { title: 'asc' },
			select: {
				title: true,
				otherMember: { select: { user: { select: { name: true } } } },
			},
		},
		(message) => seen.push(message),
	)
	await vi.waitFor(() => expect(seen).toHaveLength(1))
	return seen
}

describe('a live list showing the other row of a pair', () => {
	it('sends the rows again when a member joins or leaves', async () => {
		const [adas, bobs] = [await followed(ada), await followed(bob)]
		expect(adas[0]).toMatchObject({
			rows: [{ title: 'Duo', otherMember: null }],
		})
		expect(bobs[0]).toMatchObject({
			rows: [{ title: 'Duo', otherMember: null }],
		})
		const joined = await Member.create(
			{
				data: {
					chat: { connect: { id: chat } },
					user: { connect: { id: bob } },
				},
			},
			M,
		)
		await vi.waitFor(() => expect(adas).toHaveLength(2))
		expect(adas[1]).toMatchObject({
			changes: [{ upsert: { otherMember: { user: { name: 'Bob' } } } }],
		})
		await vi.waitFor(() => expect(bobs).toHaveLength(2))
		expect(bobs[1]).toMatchObject({
			changes: [{ upsert: { otherMember: { user: { name: 'Ada' } } } }],
		})
		await Member.delete({ where: { id: joined.id } }, M)
		await vi.waitFor(() => expect(adas).toHaveLength(3))
		expect(adas[2]).toMatchObject({
			changes: [{ upsert: { otherMember: null } }],
		})
	})
})
