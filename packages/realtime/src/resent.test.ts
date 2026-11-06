// #200: a write in a read's reach reads its rows again; only those that
// changed are sent, even when that write says nothing of which rows it concerns.
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Adapter, Caller, Filter, PluginTypes } from 'ultimabase'
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
const idOf = (caller: Caller): string =>
	caller.kind === 'user' ? caller.user.id : ''
const memberOf = (caller: Caller): Filter => ({
	members: { some: { user: { equals: idOf(caller) } } },
})
const links = (id: string) => ({ connect: { id } })

const Thread = defineModel({
	name: 'Thread',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		members: f.many(() => ThreadMember, { inverse: 'thread' }),
		messages: f.many(() => Message, { inverse: 'thread' }),
	}),
}).with({ access: { read: () => true } })
const ThreadMember = defineModel({
	name: 'ThreadMember',
	use: [realtime()],
	fields: (f) => ({ user: f.string(), thread: f.one(() => Thread) }),
}).with({ access: { read: () => true } })
/** A ticket is read by the members of a thread that holds it. */
const Ticket = defineModel({
	name: 'Ticket',
	use: [realtime()],
	fields: (f) => ({
		status: f.string(),
		messages: f.many(() => Message, { inverse: 'ticket' }),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where({
				messages: { some: { thread: { is: memberOf(caller) } } },
			}),
	},
})
/** A message is read by the members of its thread. */
const Message = defineModel({
	name: 'Message',
	use: [realtime()],
	fields: (f) => ({
		text: f.string(),
		thread: f.one(() => Thread),
		ticket: f.one(() => Ticket, { optional: true }),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where({ thread: { is: memberOf(caller) } }),
	},
})

interface Following extends PluginTypes {
	readonly name: 'following'
	readonly requires: Realtime
}
let api: RealtimeApi | undefined
/** Keeps the realtime API; a request's `authorization` is its user's id. */
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

/** The models of the reads the database ran. */
let finds: string[] = []
let app: ReturnType<typeof defineApp>
beforeEach(async () => {
	finds = []
	const database = memory()
	const counted: Adapter = {
		...database,
		find: async (read) => {
			finds.push(read.model)
			return database.find(read)
		},
	}
	app = defineApp({
		database: counted,
		models: [Thread, ThreadMember, Ticket, Message],
		plugins: [realtimePlugin(), following.plugin()],
	})
	await app.start()
})
afterEach(async () => app.stop())

/** Once the reads the writes so far started are over, past the gather. */
async function quiet(): Promise<void> {
	for (let known = -1; known !== finds.length;) {
		known = finds.length
		await new Promise((done) => setTimeout(done, 150))
	}
}

/** Thread `name`, of member `user`, holding one message of an open ticket. */
async function threadOf(name: string, user: string) {
	const thread = await Thread.create({ data: { name } }, M)
	const member = await ThreadMember.create(
		{ data: { user, thread: links(thread.id) } },
		M,
	)
	const ticket = await Ticket.create({ data: { status: 'open' } }, M)
	const message = await Message.create(
		{
			data: {
				text: name,
				thread: links(thread.id),
				ticket: links(ticket.id),
			},
		},
		M,
	)
	return { thread, member, ticket, message }
}

/** What `user` is told of the messages of `thread`, the first left in. */
async function follow(user: string, thread: string): Promise<LiveMessage[]> {
	if (api === undefined) throw new Error('No realtime API.')
	const viewer = await api.connect(
		new Request('http://localhost/', { headers: { authorization: user } }),
	)
	const seen: LiveMessage[] = []
	await viewer.list(
		'Message',
		{
			first: 10,
			where: { thread: { is: { id: { equals: thread } } } },
			select: { ticket: { select: { status: true } } },
		},
		(message) => seen.push(message),
	)
	await vi.waitFor(() => expect(seen).toHaveLength(1))
	return seen
}

it('another thread created sends nothing', async () => {
	const { thread } = await threadOf('a', 'ada')
	const seen = await follow('ada', thread.id)
	await quiet()
	await threadOf('b', 'ada')
	await quiet()
	expect(seen).toHaveLength(1)
})

it('a write that reads the whole window again sends nothing', async () => {
	const { thread } = await threadOf('a', 'ada')
	const other = await threadOf('b', 'ada')
	const seen = await follow('ada', thread.id)
	await quiet()
	finds = []
	await ThreadMember.delete({ where: { id: other.member.id } }, M)
	await quiet()
	// It did read the row again: a hash, not a filter, kept it from the client.
	expect(finds).toContain('Message')
	expect(seen).toHaveLength(1)
})

it('the next change after another write is the real one', async () => {
	const { thread, ticket, message } = await threadOf('a', 'ada')
	const seen = await follow('ada', thread.id)
	const second = await threadOf('b', 'ada')
	const other = await follow('ada', second.thread.id)
	await quiet()
	await Ticket.update(
		{ where: { id: ticket.id }, data: { status: 'closed' } },
		M,
	)
	await vi.waitFor(() => expect(seen).toHaveLength(2))
	expect(seen[1]).toMatchObject({
		changes: [{ upsert: { id: message.id, ticket: { status: 'closed' } } }],
	})
	await quiet()
	expect(other).toHaveLength(1)
})
