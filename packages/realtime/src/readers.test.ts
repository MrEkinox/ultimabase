// A write costs its readers, whoever else is connected (D-255): rules name the
// viewer through relations, and only who may read a row costs a query.
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
import { Live } from './live.ts'
import { Readers } from './readers.ts'
import { Viewer } from './viewer.ts'

const M = { as: master }
const idOf = (caller: Caller): string =>
	caller.kind === 'user' ? caller.user.id : ''
const me = (caller: Caller): Filter => ({
	user: { is: { id: { equals: idOf(caller) } } },
})
const seated = (caller: Caller): Filter => ({
	seats: { some: me(caller) },
})
const open = { access: { read: () => true } }

const User = defineModel({
	name: 'User',
	use: [realtime()],
	fields: (f) => ({ name: f.string() }),
}).with(open)
/** A viewer reads the chats they sit in. */
const Chat = defineModel({
	name: 'Chat',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		seats: f.many(() => Seat, { inverse: 'chat' }),
		notes: f.many(() => Note, { inverse: 'chat' }),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where(seated(caller)),
	},
})
const Seat = defineModel({
	name: 'Seat',
	use: [realtime()],
	fields: (f) => ({ user: f.one(() => User), chat: f.one(() => Chat) }),
}).with(open)
/** A viewer reads the notes of the chats they sit in. */
const Note = defineModel({
	name: 'Note',
	use: [realtime()],
	fields: (f) => ({ text: f.string(), chat: f.one(() => Chat) }),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where({ chat: { is: seated(caller) } }),
	},
})

/** A viewer reads the camps they lead and those they joined, not those they left. */
const Camp = defineModel({
	name: 'Camp',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		leader: f.one(() => User),
		joined: f.many(() => Joined, { inverse: 'camp' }),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where({
				OR: [
					{ leader: { is: { id: { equals: idOf(caller) } } } },
					{
						joined: {
							some: { ...me(caller), status: { equals: 'member' } },
						},
					},
				],
			}),
	},
})
const Joined = defineModel({
	name: 'Joined',
	use: [realtime()],
	fields: (f) => ({
		status: f.string(),
		user: f.one(() => User),
		camp: f.one(() => Camp),
	}),
}).with(open)
/** A viewer reads a board they own or one tagged with their name, many-to-many. */
const Board = defineModel({
	name: 'Board',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		owner: f.string(),
		tags: f.many(() => Tag, { inverse: 'boards' }),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where({
				OR: [
					{ owner: { equals: idOf(caller) } },
					{ tags: { some: { name: { equals: idOf(caller) } } } },
				],
			}),
	},
})
const Tag = defineModel({
	name: 'Tag',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		boards: f.many(() => Board, { inverse: 'tags' }),
	}),
}).with(open)

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
		models: [User, Chat, Seat, Note, Camp, Joined, Board, Tag],
		plugins: [
			realtimePlugin({ maxLive: 100_000, maxConnectionRows: 1_000_000 }),
			following.plugin(),
		],
	})
	await app.start()
})
afterEach(async () => app.stop())

/** The messages of a live list of `model` as `id`, the first left in. */
async function follow(
	model: string,
	id: string,
	args: object,
): Promise<LiveMessage[]> {
	if (api === undefined) throw new Error('No realtime API.')
	const viewer = await api.connect(
		new Request('http://localhost/', { headers: { authorization: id } }),
	)
	const seen: LiveMessage[] = []
	await viewer.list(model, args, (message) => seen.push(message))
	await vi.waitFor(() => expect(seen).toHaveLength(1))
	return seen
}

const links = (id: string) => ({ connect: { id } })

/** Once the reads the writes so far started are over, past the gather. */
async function quiet(): Promise<void> {
	for (let known = -1; known !== finds.length;) {
		known = finds.length
		await new Promise((done) => setTimeout(done, 150))
	}
}

/** The reads `write` costs, once its live reads are done. */
async function readsOf(write: () => Promise<unknown>): Promise<number> {
	await quiet()
	finds = []
	await write()
	await quiet()
	return finds.length
}

/** A chat, and a member for each name. */
async function chatOf(names: readonly string[]) {
	const chat = await Chat.create({ data: { name: 'chat' } }, M)
	const users = await Promise.all(
		names.map(async (name) => User.create({ data: { name } }, M)),
	)
	for (const user of users) {
		await Seat.create(
			{ data: { user: links(user.id), chat: links(chat.id) } },
			M,
		)
	}
	return { chat, users }
}

const notesOf = (chat: { readonly id: string }) => ({
	first: 10,
	select: { text: true },
	where: { chat: { is: { id: { equals: chat.id } } } },
})
const seenIn = (seen: readonly LiveMessage[]) => JSON.stringify(seen)

it('a note in a chat costs nothing for each viewer of another chat', async () => {
	const { chat, users } = await chatOf(['ada', 'bob'])
	const [ada] = users
	const hers = await follow('Note', ada?.id ?? '', notesOf(chat))
	const note = (text: string) => async () =>
		Note.create({ data: { text, chat: links(chat.id) } }, M)
	const alone = await readsOf(note('one'))
	await vi.waitFor(() => expect(seenIn(hers)).toContain('"text":"one"'))
	const others = await Promise.all(
		['cy', 'dee', 'eve', 'fay'].map(async (name) => {
			const other = await chatOf([name])
			return follow('Note', other.users[0]?.id ?? '', notesOf(other.chat))
		}),
	)
	expect(await readsOf(note('two'))).toBe(alone)
	await vi.waitFor(() => expect(seenIn(hers)).toContain('"text":"two"'))
	for (const seen of others) expect(seenIn(seen)).not.toContain('"text"')
})

const chats = { first: 10, select: { name: true } }

it('a chat written costs nothing for each viewer of another chat', async () => {
	const { chat, users } = await chatOf(['ada', 'bob'])
	const members = await Promise.all(
		users.map(async ({ id }) => follow('Chat', id, chats)),
	)
	const rename = (name: string) => async () =>
		Chat.update({ where: { id: chat.id }, data: { name } }, M)
	const alone = await readsOf(rename('one'))
	const others = await Promise.all(
		['cy', 'dee', 'eve', 'fay'].map(async (name) => {
			const other = await chatOf([name])
			return follow('Chat', other.users[0]?.id ?? '', chats)
		}),
	)
	expect(await readsOf(rename('two'))).toBe(alone)
	for (const seen of members) {
		await vi.waitFor(() => expect(seenIn(seen)).toContain('"name":"two"'))
	}
	for (const seen of others) expect(seenIn(seen)).not.toContain('"name":"two"')
})

it('a new note costs nothing for each viewer of another chat, whatever list they hold', async () => {
	const { chat, users } = await chatOf(['ada'])
	const hers = await follow('Note', users[0]?.id ?? '', { first: 10 })
	const note = (text: string) => async () =>
		Note.create({ data: { text, chat: links(chat.id) } }, M)
	const alone = await readsOf(note('one'))
	const others = await Promise.all(
		['bob', 'cy', 'dee'].map(async (name) => {
			const other = await chatOf([name])
			return follow('Note', other.users[0]?.id ?? '', { first: 10 })
		}),
	)
	expect(await readsOf(note('two'))).toBe(alone)
	await vi.waitFor(() => expect(seenIn(hers)).toContain('"text":"two"'))
	for (const seen of others) expect(seenIn(seen)).not.toContain('"text"')
})

it('a rule of two branches refuses in memory whoever neither names', async () => {
	const [lead, member, gone, stranger] = await Promise.all(
		['lead', 'member', 'gone', 'stranger'].map(async (name) =>
			User.create({ data: { name } }, M),
		),
	)
	const leader = lead?.id ?? ''
	const camp = await Camp.create(
		{ data: { name: 'camp', leader: links(leader) } },
		M,
	)
	const join = async (id: string, status: string) =>
		Joined.create(
			{ data: { status, user: links(id), camp: links(camp.id) } },
			M,
		)
	await join(member?.id ?? '', 'member')
	await join(gone?.id ?? '', 'left')
	const rename = (name: string) => async () =>
		Camp.update({ where: { id: camp.id }, data: { name } }, M)
	const told = await Promise.all(
		[leader, member?.id ?? ''].map(async (id) => follow('Camp', id, chats)),
	)
	const alone = await readsOf(rename('one'))
	const refused = await Promise.all(
		[gone?.id ?? '', stranger?.id ?? ''].map(async (id) =>
			follow('Camp', id, chats),
		),
	)
	expect(await readsOf(rename('two'))).toBe(alone)
	for (const seen of told) {
		await vi.waitFor(() => expect(seenIn(seen)).toContain('"name":"two"'))
	}
	for (const seen of refused) expect(seenIn(seen)).not.toContain('"name"')
})

it('a chat shows up and leaves as its seat comes and goes', async () => {
	const { chat } = await chatOf(['ada'])
	const bob = await User.create({ data: { name: 'bob' } }, M)
	const seen = await follow('Chat', bob.id, chats)
	const seat = await Seat.create(
		{ data: { user: links(bob.id), chat: links(chat.id) } },
		M,
	)
	await vi.waitFor(() => expect(seenIn(seen)).toContain('"name":"chat"'))
	await Seat.delete({ where: { id: seat.id } }, M)
	await vi.waitFor(() =>
		expect(JSON.stringify(seen.at(-1))).toContain(`"remove":"${chat.id}"`),
	)
})

it('a chat of many members tells its members alone, each found by their id', async () => {
	const names = Array.from({ length: 30 }, (_, index) => `user${index}`)
	const { chat, users } = await chatOf(names)
	const [first] = users
	const hers = await follow('Chat', first?.id ?? '', chats)
	const rename = (name: string) => async () =>
		Chat.update({ where: { id: chat.id }, data: { name } }, M)
	const alone = await readsOf(rename('one'))
	const others = await Promise.all(
		['cy', 'dee', 'eve'].map(async (name) => {
			const other = await chatOf([name])
			return follow('Chat', other.users[0]?.id ?? '', chats)
		}),
	)
	expect(await readsOf(rename('two'))).toBe(alone)
	await vi.waitFor(() => expect(seenIn(hers)).toContain('"name":"two"'))
	for (const seen of others) expect(seenIn(seen)).not.toContain('"name":"two"')
})

it('past what a shared read holds, the query decides', async () => {
	const { chat, users } = await chatOf(['ada'])
	const stranger = await chatOf(['bob'])
	const crowd = await User.create({ data: { name: 'crowd' } }, M)
	await Seat.createMany(
		{
			data: Array.from({ length: 10_000 }, () => ({
				user: links(crowd.id),
				chat: links(chat.id),
			})),
		},
		M,
	)
	const hers = await follow('Chat', users[0]?.id ?? '', chats)
	const his = await follow('Chat', stranger.users[0]?.id ?? '', chats)
	await Chat.update({ where: { id: chat.id }, data: { name: 'two' } }, M)
	await vi.waitFor(() => expect(seenIn(hers)).toContain('"name":"two"'))
	await quiet()
	expect(seenIn(his)).not.toContain('"name":"two"')
})

it('a many-to-many branch says nothing, and the query decides', async () => {
	const board = await Board.create({ data: { name: 'board', owner: 'ada' } }, M)
	await Tag.create(
		{ data: { name: 'bob', boards: { connect: [{ id: board.id }] } } },
		M,
	)
	const told = await Promise.all(
		['ada', 'bob'].map(async (id) => follow('Board', id, chats)),
	)
	const refused = await follow('Board', 'cy', chats)
	await Board.update({ where: { id: board.id }, data: { name: 'two' } }, M)
	for (const seen of told) {
		await vi.waitFor(() => expect(seenIn(seen)).toContain('"name":"two"'))
	}
	await quiet()
	expect(seenIn(refused)).not.toContain('"name":"two"')
})

it('a flush slower than the gather leaves no empty flush behind', async () => {
	const { chat, users } = await chatOf(['ada'])
	const seen = await follow('Chat', users[0]?.id ?? '', chats)
	await quiet()
	const { promise: held, resolve: release } = Promise.withResolvers<void>()
	const flushes = vi
		.spyOn(Viewer.prototype, 'flush')
		.mockImplementationOnce(async () => held)
	const rename = async (name: string) =>
		Chat.update({ where: { id: chat.id }, data: { name } }, M)
	await rename('one')
	await vi.waitFor(() => expect(flushes).toHaveBeenCalledOnce())
	for (const name of ['two', 'three', 'four']) {
		await rename(name)
		await new Promise((done) => setTimeout(done, 80))
	}
	release()
	await vi.waitFor(() => expect(seenIn(seen)).toContain('"name":"four"'))
	await quiet()
	expect(flushes).toHaveBeenCalledTimes(2)
	flushes.mockRestore()
})

it('a change after a quiet flushes at once, the next ones 50 ms later', async () => {
	const { chat, users } = await chatOf(['ada'])
	const seen = await follow('Chat', users[0]?.id ?? '', chats)
	await quiet()
	const rename = async (name: string) =>
		Chat.update({ where: { id: chat.id }, data: { name } }, M)
	// A flush starts by finding its readers: the gather is timed from there,
	// not from its viewers, which a slow first search would bring closer. The
	// second change comes during the first flush, for the gather alone to
	// space them, not the test's own waits.
	const flushed: number[] = []
	let second: Promise<unknown> | undefined
	// oxlint-disable-next-line typescript/unbound-method -- Called on its readers.
	const concerned = Readers.prototype.concerned
	const flushes = vi
		.spyOn(Readers.prototype, 'concerned')
		.mockImplementation(async function finding(
			this: Readers,
			...args: Parameters<Readers['concerned']>
		) {
			flushed.push(performance.now())
			if (flushed.length === 1) {
				second = rename('two')
				await new Promise((done) => setTimeout(done, 10))
			}
			return concerned.apply(this, args)
		})
	// A timer set late in a busy turn of the event loop rings that much early:
	// each one here rings 5 ms early, for the gather to hold all the same.
	const ring = globalThis.setTimeout
	const timers = vi
		.spyOn(globalThis, 'setTimeout')
		.mockImplementation((callback: () => void, delay?: number) =>
			ring(callback, Math.max((delay ?? 0) - 5, 0)),
		)
	await rename('one')
	// The second flush may come by the next look: the gather is the poll's.
	await vi.waitFor(() => expect(flushes).toHaveBeenCalled())
	expect(timers.mock.calls.map(([, delay]) => delay)).toContain(0)
	await second
	await vi.waitFor(() => expect(flushes).toHaveBeenCalledTimes(2))
	await vi.waitFor(() => expect(seenIn(seen)).toContain('"name":"two"'))
	expect((flushed[1] ?? 0) - (flushed[0] ?? 0)).toBeGreaterThanOrEqual(49)
	flushes.mockRestore()
	timers.mockRestore()
})

it('a write out of a list reach costs that list nothing', async () => {
	const { chat, users } = await chatOf(['ada'])
	const id = users[0]?.id ?? ''
	await follow('Chat', id, chats)
	await follow('Note', id, notesOf(chat))
	await quiet()
	const applied = vi.spyOn(Live.prototype, 'apply')
	await Note.create({ data: { text: 'one', chat: links(chat.id) } }, M)
	await vi.waitFor(() => expect(applied).toHaveBeenCalledOnce())
	// The chats list holds no note, the notes list holds them.
	await quiet()
	expect(applied).toHaveBeenCalledOnce()
	applied.mockClear()
	// Both rules name the user through a seat, none reads a name.
	await User.update({ where: { id }, data: { name: 'ada2' } }, M)
	await Tag.create({ data: { name: 'tag' } }, M)
	await quiet()
	expect(applied).not.toHaveBeenCalled()
	applied.mockRestore()
})

it('a flush gives the event loop its turn, however many viewers wait', async () => {
	const { chat, users } = await chatOf(['ada'])
	const id = users[0]?.id ?? ''
	await Promise.all(
		Array.from({ length: 24 }, async () => follow('Chat', id, chats)),
	)
	await quiet()
	/** The event loop's turn, and the turns the flush ran in. */
	let turn = 0
	const turns = new Set<number>()
	let turning = true
	const next = (): void => {
		turn += 1
		if (turning) setImmediate(next)
	}
	next()
	const flushes = vi
		.spyOn(Viewer.prototype, 'flush')
		.mockImplementation(async () => {
			// As a viewer that waits for nothing: only microtasks follow.
			turns.add(turn)
			const end = performance.now() + 5
			while (performance.now() < end);
		})
	await Chat.update({ where: { id: chat.id }, data: { name: 'one' } }, M)
	await vi.waitFor(() => expect(flushes).toHaveBeenCalledTimes(24))
	turning = false
	flushes.mockRestore()
	// 24 viewers of 5 ms each: a single turn without the slices.
	expect(turns.size).toBeGreaterThan(5)
})
