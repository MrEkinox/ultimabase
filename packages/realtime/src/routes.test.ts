// A write visits the reads it can concern (D-256): each list here hears what
// its rows became, and a list the write cannot concern is not visited at all.
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { Adapter, Caller, Filter, Logger, PluginTypes } from 'ultimabase'
import {
	allow,
	defineApp,
	defineFunction,
	defineModel,
	definePlugin,
	master,
	memory,
} from 'ultimabase'
import type { Batch } from './changes.ts'
import { listed } from './changes.ts'
import { Computed } from './computed.ts'
import type { LiveMessage, Realtime, RealtimeApi } from './index.ts'
import { realtime, realtimePlugin } from './index.ts'
import { Live } from './live.ts'
import type { Owner } from './readers.ts'
import { Readers } from './readers.ts'
import { Loader } from './loader.ts'
import { Viewer } from './viewer.ts'

const M = { as: master }
const idOf = (caller: Caller): string =>
	caller.kind === 'user' ? caller.user.id : ''
/** The room each user was last identified in. */
const rooms = new Map<string, string>()
const silent: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => silent,
}
const seated = (caller: Caller): Filter => ({
	seats: { some: { user: { is: { id: { equals: idOf(caller) } } } } },
})
const open = { access: { read: () => true } }

const User = defineModel({
	name: 'User',
	use: [realtime()],
	fields: (f) => ({ name: f.string(), room: f.string({ optional: true }) }),
}).with(open)
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
/** Its rules name the chat through a relation, as the list's filter does. */
const Note = defineModel({
	name: 'Note',
	use: [realtime()],
	fields: (f) => ({
		text: f.string(),
		chat: f.one(() => Chat),
		author: f.one(() => User),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where({ chat: { is: seated(caller) } }),
	},
})
/** Its rules name the chat the caller was last built in. */
const Bulletin = defineModel({
	name: 'Bulletin',
	use: [realtime()],
	fields: (f) => ({ text: f.string(), chat: f.one(() => Chat) }),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where({
				chat: { is: { id: { equals: rooms.get(idOf(caller)) ?? '' } } },
			}),
	},
})
const Board = defineModel({
	name: 'Board',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		tags: f.many(() => Tag, { inverse: 'boards' }),
	}),
}).with(open)
const Tag = defineModel({
	name: 'Tag',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		boards: f.many(() => Board, { inverse: 'tags' }),
	}),
}).with(open)

let runs = 0
let failing = false
let watched = ''
const notesRead = defineFunction({
	name: 'notesRead',
	query: true,
	use: [realtime()],
	output: z.number(),
	run: async () => {
		runs += 1
		if (failing) throw new Error('No notes.')
		return Note.count({ where: { chat: { is: { id: watched } } } }, M)
	},
}).with({ access: allow.public, realtime: { debounce: 1 } })

interface Following extends PluginTypes {
	readonly name: 'following'
	readonly requires: Realtime
}
let api: RealtimeApi | undefined
/** A request's `authorization` is its user's id: the caller reads that user. */
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
		if (id === null) return undefined
		const user = await User.findUnique({ where: { id } }, M)
		rooms.set(id, user?.room ?? '')
		return asUser({ id })
	},
})

let finds = 0
let app: ReturnType<typeof defineApp>
const applied = vi.spyOn(Live.prototype, 'apply')
beforeEach(async () => {
	runs = 0
	failing = false
	const database = memory()
	const counted: Adapter = {
		...database,
		find: async (read) => {
			finds += 1
			return database.find(read)
		},
	}
	app = defineApp({
		database: counted,
		models: [User, Chat, Seat, Note, Bulletin, Board, Tag],
		functions: [notesRead],
		plugins: [realtimePlugin(), following.plugin()],
		logger: silent,
	})
	await app.start()
})
afterEach(async () => app.stop())

const connect = async (id: string): Promise<Viewer> => {
	if (api === undefined) throw new Error('No realtime API.')
	return api.connect(
		new Request('http://localhost/', { headers: { authorization: id } }),
	)
}

/** The messages of a live list of `model` as `id`, the first left in. */
async function follow(
	model: string,
	id: string,
	args: object,
): Promise<LiveMessage[]> {
	const seen: LiveMessage[] = []
	const viewer = await connect(id)
	await viewer.list(model, args, (message) => seen.push(message))
	await vi.waitFor(() => expect(seen).toHaveLength(1))
	return seen
}

/** Once the reads the writes so far started are over, past the gather. */
async function quiet(): Promise<void> {
	for (let known = -1; known !== finds;) {
		known = finds
		await new Promise((done) => setTimeout(done, 80))
	}
}

/** How many live reads `write` visits. */
async function visitsOf(write: () => Promise<unknown>): Promise<number> {
	await quiet()
	applied.mockClear()
	await write()
	await quiet()
	return applied.mock.calls.length
}

const links = (id: string) => ({ connect: { id } })
const seenIn = (seen: readonly LiveMessage[]) => JSON.stringify(seen)

/** A chat, a user in it for each name, and the first one's id. */
async function chatOf(...names: readonly string[]) {
	const chat = await Chat.create({ data: { name: 'chat' } }, M)
	const users = await Promise.all(
		names.map(async (name) => User.create({ data: { name } }, M)),
	)
	const seats = await Promise.all(
		users.map(async (user) =>
			Seat.create({ data: { user: links(user.id), chat: links(chat.id) } }, M),
		),
	)
	return { chat, users, seats, id: users[0]?.id ?? '' }
}

const inChat = (
	chat: { readonly id: string },
	select: object = { text: true },
) => ({ first: 10, select, where: { chat: { is: { id: chat.id } } } })
const ofUser = (id: string, select: object) => ({
	first: 10,
	select,
	where: { seats: { some: { user: { is: { id } } } } },
})
const noteIn = async (
	{ chat, id }: { readonly chat: { id: string }; readonly id: string },
	text: string,
) => Note.create({ data: { text, chat: links(chat.id), author: links(id) } }, M)

it('a row named by its id visits only the lists naming it', async () => {
	const ada = await User.create({ data: { name: 'ada' } }, M)
	const bob = await User.create({ data: { name: 'bob' } }, M)
	const select = { name: true }
	const hers = await follow('User', ada.id, {
		first: 10,
		select,
		where: { id: { in: [ada.id] } },
	})
	const his = await follow('User', bob.id, {
		first: 10,
		select,
		where: { id: bob.id },
	})
	const rename = (id: string, name: string) => async () =>
		User.update({ where: { id }, data: { name } }, M)
	expect(await visitsOf(rename(ada.id, 'ada2'))).toBe(1)
	expect(seenIn(hers)).toContain('ada2')
	expect(seenIn(his)).not.toContain('ada2')
	expect(await visitsOf(rename(bob.id, 'bob2'))).toBe(1)
	expect(seenIn(his)).toContain('bob2')
})

it('a condition that is no plain id visits every list of its shape', async () => {
	const ada = await User.create({ data: { name: 'ada' } }, M)
	const hers = await follow('User', ada.id, {
		first: 10,
		select: { name: true },
		where: { id: { not: 'nobody' } },
	})
	await User.update({ where: { id: ada.id }, data: { name: 'ada2' } }, M)
	await vi.waitFor(() => expect(seenIn(hers)).toContain('ada2'))
})

const inRoom = (name: string) => ({
	first: 10,
	select: { name: true },
	where: { room: name },
})

it('a text a read requires names the lists a row visits', async () => {
	const row = await User.create({ data: { name: 'ada', room: 'a' } }, M)
	const inA = await follow('User', 'one', inRoom('a'))
	const inB = await follow('User', 'two', inRoom('b'))
	const rename = async () =>
		User.update({ where: { id: row.id }, data: { name: 'ada2' } }, M)
	expect(await visitsOf(rename)).toBe(1)
	expect(seenIn(inA)).toContain('ada2')
	expect(seenIn(inB)).not.toContain('ada2')
	const joins = async () => User.create({ data: { name: 'bob', room: 'b' } }, M)
	expect(await visitsOf(joins)).toBe(1)
	expect(seenIn(inB)).toContain('bob')
	expect(seenIn(inA)).not.toContain('bob')
	const nowhere = async () => User.create({ data: { name: 'cy' } }, M)
	expect(await visitsOf(nowhere)).toBe(0)
})

it('a row whose text moves leaves one list and joins the other', async () => {
	const row = await User.create({ data: { name: 'ada', room: 'a' } }, M)
	const inA = await follow('User', 'one', inRoom('a'))
	const inB = await follow('User', 'two', inRoom('b'))
	await User.update({ where: { id: row.id }, data: { room: 'b' } }, M)
	await vi.waitFor(() => expect(seenIn(inA)).toContain(`"remove":"${row.id}"`))
	await vi.waitFor(() => expect(seenIn(inB)).toContain('ada'))
	await User.delete({ where: { id: row.id } }, M)
	await vi.waitFor(() => expect(seenIn(inB)).toContain(`"remove":"${row.id}"`))
	expect(seenIn(inA).split('remove')).toHaveLength(2)
})

it('a deleted row whose text is unknown visits the lists holding it or counting (D-314)', async () => {
	const row = await User.create({ data: { name: 'ada', room: 'a' } }, M)
	const away = await User.create({ data: { name: 'bob', room: 'z' } }, M)
	const inA = await follow('User', 'one', inRoom('a'))
	await follow('User', 'two', inRoom('b'))
	const counted = await follow('User', 'three', {
		...inRoom('z'),
		first: 0,
		totalCount: true,
	})
	const gone = (id: string) => async () => User.delete({ where: { id } }, M)
	expect(await visitsOf(gone(row.id))).toBe(2)
	expect(seenIn(inA)).toContain(`"remove":"${row.id}"`)
	expect(await visitsOf(gone(away.id))).toBe(1)
	expect(seenIn(counted)).toContain('"totalCount":0')
})

it('rows deleted together each visit the lists holding them (D-314)', async () => {
	const inRowA = await User.create({ data: { name: 'ada', room: 'a' } }, M)
	const inRowB = await User.create({ data: { name: 'bob', room: 'b' } }, M)
	const inA = await follow('User', 'one', inRoom('a'))
	const inB = await follow('User', 'two', inRoom('b'))
	await follow('User', 'three', inRoom('c'))
	const both = async () =>
		User.deleteMany({ where: { id: { in: [inRowA.id, inRowB.id] } } }, M)
	expect(await visitsOf(both)).toBe(2)
	expect(seenIn(inA)).toContain(`"remove":"${inRowA.id}"`)
	expect(seenIn(inA)).not.toContain(inRowB.id)
	expect(seenIn(inB)).toContain(`"remove":"${inRowB.id}"`)
	expect(seenIn(inB)).not.toContain(inRowA.id)
})

it('a condition ignoring case names no list: it can match another spelling', async () => {
	const row = await User.create({ data: { name: 'ada', room: 'lobby' } }, M)
	const seen = await follow('User', 'one', {
		first: 10,
		select: { name: true },
		where: { room: { equals: 'LOBBY', mode: 'insensitive' } },
	})
	await User.update({ where: { id: row.id }, data: { name: 'ada2' } }, M)
	await vi.waitFor(() => expect(seenIn(seen)).toContain('ada2'))
})

it('a row visits the lists of the key it holds, its rules merged in', async () => {
	const first = await chatOf('ada')
	const second = await chatOf('bob')
	const hers = await follow('Note', first.id, inChat(first.chat))
	const his = await follow('Note', second.id, inChat(second.chat))
	expect(await visitsOf(async () => noteIn(first, 'one'))).toBe(1)
	expect(seenIn(hers)).toContain('one')
	expect(seenIn(his)).not.toContain('one')
})

it('a deleted row visits the list of the key it held', async () => {
	const first = await chatOf('ada')
	const second = await chatOf('bob')
	const note = await noteIn(first, 'one')
	const hers = await follow('Note', first.id, inChat(first.chat))
	await follow('Note', second.id, inChat(second.chat))
	const gone = async () => Note.delete({ where: { id: note.id } }, M)
	expect(await visitsOf(gone)).toBe(1)
	expect(seenIn(hers)).toContain(`"remove":"${note.id}"`)
})

it('a row whose key moves visits the lists on both sides', async () => {
	const first = await chatOf('ada', 'bob')
	const second = await chatOf('cy')
	await Seat.create(
		{ data: { user: links(first.id), chat: links(second.chat.id) } },
		M,
	)
	const note = await noteIn(first, 'one')
	const left = await follow('Note', first.id, inChat(first.chat))
	const joined = await follow('Note', first.id, inChat(second.chat))
	await Note.update(
		{ where: { id: note.id }, data: { chat: links(second.chat.id) } },
		M,
	)
	await vi.waitFor(() =>
		expect(seenIn(left)).toContain(`"remove":"${note.id}"`),
	)
	await vi.waitFor(() => expect(seenIn(joined)).toContain('one'))
})

it('a nested row visits the lists it leads to, through a path', async () => {
	const first = await chatOf('ada')
	const second = await chatOf('bob')
	const select = { notes: { take: 5, select: { text: true } } }
	const hers = await follow('Chat', first.id, ofUser(first.id, select))
	const his = await follow('Chat', second.id, ofUser(second.id, select))
	expect(await visitsOf(async () => noteIn(first, 'one'))).toBe(1)
	expect(seenIn(hers)).toContain('one')
	expect(seenIn(his)).not.toContain('one')
})

it('a shown row visits the lists showing it, forward to their pin', async () => {
	const first = await chatOf('ada', 'bob')
	const second = await chatOf('cy')
	const select = {
		name: true,
		seats: { take: 5, select: { user: { select: { name: true } } } },
	}
	const hers = await follow('Chat', first.id, ofUser(first.id, select))
	const his = await follow('Chat', second.id, ofUser(second.id, select))
	const rename = async () =>
		User.update(
			{ where: { id: first.users[1]?.id ?? '' }, data: { name: 'bob2' } },
			M,
		)
	expect(await visitsOf(rename)).toBe(1)
	expect(seenIn(hers)).toContain('bob2')
	expect(seenIn(his)).not.toContain('bob2')
})

it('a row shown through its key visits the lists of the rows holding it', async () => {
	const first = await chatOf('ada')
	const second = await chatOf('bob')
	await noteIn(first, 'one')
	await noteIn(second, 'two')
	const select = { text: true, author: { select: { name: true } } }
	const hers = await follow('Note', first.id, inChat(first.chat, select))
	const his = await follow('Note', second.id, inChat(second.chat, select))
	const rename = async () =>
		User.update({ where: { id: first.id }, data: { name: 'ada2' } }, M)
	expect(await visitsOf(rename)).toBe(1)
	expect(seenIn(hers)).toContain('ada2')
	expect(seenIn(his)).not.toContain('ada2')
})

it('a read that fails visits every list of its shape', async () => {
	const first = await chatOf('ada')
	const second = await chatOf('bob')
	await noteIn(first, 'one')
	await noteIn(second, 'two')
	const select = { text: true, author: { select: { name: true } } }
	const hers = await follow('Note', first.id, inChat(first.chat, select))
	await follow('Note', second.id, inChat(second.chat, select))
	await quiet()
	const holding = vi
		.spyOn(Loader.prototype, 'holding')
		.mockRejectedValueOnce(new Error('No read.'))
	const rename = async () =>
		User.update({ where: { id: first.id }, data: { name: 'ada2' } }, M)
	expect(await visitsOf(rename)).toBe(2)
	holding.mockRestore()
	await vi.waitFor(() => expect(seenIn(hers)).toContain('ada2'))
})

it('a row entering through the path reaches the list it now joins', async () => {
	const first = await chatOf('ada')
	const second = await chatOf('cy')
	const bob = await User.create({ data: { name: 'bob' } }, M)
	const select = { name: true }
	const his = await follow('Chat', bob.id, ofUser(bob.id, select))
	await follow('Chat', second.id, ofUser(second.id, select))
	const sit = async () =>
		Seat.create(
			{ data: { user: links(bob.id), chat: links(first.chat.id) } },
			M,
		)
	expect(await visitsOf(sit)).toBe(1)
	expect(seenIn(his)).toContain(first.chat.id)
})

it('a row deleted on the path leaves the list it held', async () => {
	const first = await chatOf('ada')
	const second = await chatOf('cy')
	const select = { name: true }
	const hers = await follow('Chat', first.id, ofUser(first.id, select))
	await follow('Chat', second.id, ofUser(second.id, select))
	const leave = async () =>
		Seat.delete({ where: { id: first.seats[0]?.id ?? '' } }, M)
	// The row is gone: what it led to is no longer known, so all are visited.
	expect(await visitsOf(leave)).toBe(2)
	expect(seenIn(hers)).toContain(`"remove":"${first.chat.id}"`)
})

it('a many-to-many link reaches the list it changes', async () => {
	const tag = await Tag.create({ data: { name: 'tag' } }, M)
	const board = await Board.create({ data: { name: 'board' } }, M)
	const seen = await follow('Board', 'ada', {
		first: 10,
		select: { name: true },
		where: { tags: { some: { id: tag.id } } },
	})
	await Board.update(
		{ where: { id: board.id }, data: { tags: { connect: [{ id: tag.id }] } } },
		M,
	)
	await vi.waitFor(() => expect(seenIn(seen)).toContain('board'))
})

it('a live function runs again only for what it read', async () => {
	const first = await chatOf('ada')
	const second = await chatOf('bob')
	watched = first.chat.id
	const seen: LiveMessage[] = []
	const viewer = await connect(first.id)
	await viewer.value(
		'notesRead',
		async () => notesRead.run({ as: master }),
		(message) => seen.push(message),
	)
	await vi.waitFor(() => expect(seen).toHaveLength(1))
	await quiet()
	const before = runs
	await noteIn(second, 'elsewhere')
	await quiet()
	expect(runs).toBe(before)
	await noteIn(first, 'here')
	await vi.waitFor(() => expect(seenIn(seen)).toContain('"value":1'))
})

it('a live function is given only the rows that lead to its read (D-260)', async () => {
	const first = await chatOf('ada')
	const second = await chatOf('bob')
	watched = first.chat.id
	const seen: LiveMessage[] = []
	const viewer = await connect(first.id)
	await viewer.value(
		'notesRead',
		async () => notesRead.run({ as: master }),
		(message) => seen.push(message),
	)
	await vi.waitFor(() => expect(seen).toHaveLength(1))
	await quiet()
	const given = vi.spyOn(Computed.prototype, 'apply')
	const [here] = await Promise.all([
		noteIn(first, 'here'),
		noteIn(second, 'elsewhere'),
	])
	await vi.waitFor(() => expect(seenIn(seen)).toContain('"value":1'))
	const rows = given.mock.calls.flatMap(([batch]) => [
		...listed(batch.get('Note')?.inserts),
	])
	expect(rows).toEqual([here.id])
	given.mockRestore()
	await Note.delete({ where: { id: here.id } }, M)
	await vi.waitFor(() => expect(seenIn(seen)).toContain('"value":0'))
})

it('a live function that cannot start leaves nothing behind', async () => {
	const { id } = await chatOf('ada')
	failing = true
	const forget = vi.spyOn(Readers.prototype, 'forget')
	const viewer = await connect(id)
	await expect(
		viewer.value(
			'notesRead',
			async () => notesRead.run({ as: master }),
			() => undefined,
		),
	).rejects.toThrow('No notes.')
	expect(forget.mock.calls.some(([reader]) => reader instanceof Computed)).toBe(
		true,
	)
	forget.mockRestore()
})

it('a caller is built again only by what built it', async () => {
	const ada = await User.create({ data: { name: 'ada' } }, M)
	const bob = await User.create({ data: { name: 'bob' } }, M)
	await connect(ada.id)
	await quiet()
	const rebuilt = vi.spyOn(Viewer.prototype, 'rebuild')
	await User.update({ where: { id: bob.id }, data: { name: 'bob2' } }, M)
	await quiet()
	expect(rebuilt).not.toHaveBeenCalled()
	await User.update({ where: { id: ada.id }, data: { name: 'ada2' } }, M)
	await vi.waitFor(() => expect(rebuilt).toHaveBeenCalledOnce())
	rebuilt.mockRestore()
})

it('a list follows the pin its new plan holds', async () => {
	const { chat: before } = await chatOf('cy')
	const { chat: after } = await chatOf('dee')
	const ada = await User.create({ data: { name: 'ada', room: before.id } }, M)
	const hers = await follow('Bulletin', ada.id, {
		first: 10,
		select: { text: true },
	})
	const post = (text: string, chat: { readonly id: string }) => async () =>
		Bulletin.create({ data: { text, chat: links(chat.id) } }, M)
	expect(await visitsOf(post('elsewhere', after))).toBe(0)
	await post('here', before)()
	await vi.waitFor(() => expect(seenIn(hers)).toContain('here'))
	await User.update({ where: { id: ada.id }, data: { room: after.id } }, M)
	await vi.waitFor(() => expect(seenIn(hers)).toContain('elsewhere'))
	await quiet()
	expect(await visitsOf(post('gone', before))).toBe(0)
	await post('moved', after)()
	await vi.waitFor(() => expect(seenIn(hers)).toContain('moved'))
})

it('a viewer closed while it plans a list refuses it', async () => {
	const viewer = await connect('ada')
	const asked = viewer.list('User', { first: 1 }, () => undefined)
	viewer.close()
	await expect(asked).rejects.toThrow('The viewer is closed.')
})

const noWrite: Batch = new Map()
const owner: Owner = {
	flush: async () => undefined,
	end: () => undefined,
}
const concerned = async (readers: Readers) =>
	readers.concerned(noWrite, new Loader())

it('a busy read is visited whatever a write says: its task may miss it', async () => {
	const readers = new Readers()
	const reader = {}
	readers.followReads(owner, reader, [])
	expect((await concerned(readers)).size).toBe(0)
	readers.busy(reader, true)
	readers.busy(reader, true)
	readers.busy(reader, false)
	expect((await concerned(readers)).get(owner)).toEqual(
		new Map([[reader, undefined]]),
	)
	readers.busy(reader, false)
	expect((await concerned(readers)).size).toBe(0)
})

it('a read that ran a task from before its entry is not visited', async () => {
	const readers = new Readers()
	const { promise, resolve } = Promise.withResolvers<void>()
	const running = readers.during({}, async () => promise)
	expect((await concerned(readers)).size).toBe(0)
	resolve()
	await running
})

it('a read that holds virtuals is visited until it stops or is forgotten', async () => {
	const readers = new Readers()
	const reader = {}
	readers.followReads(owner, reader, [])
	readers.always(reader, true)
	readers.followReads(owner, reader, [])
	expect((await concerned(readers)).get(owner)).toEqual(
		new Map([[reader, undefined]]),
	)
	readers.always(reader, false)
	expect((await concerned(readers)).size).toBe(0)
	readers.always(reader, true)
	readers.forget(reader)
	readers.followReads(owner, reader, [])
	expect((await concerned(readers)).size).toBe(0)
})

/** The rows of `model` each list visited by `write` was given (D-258). */
async function rowsSeen(
	model: string,
	write: () => Promise<unknown>,
): Promise<readonly (readonly string[])[]> {
	await visitsOf(write)
	return applied.mock.calls.map(([batch]) => {
		const changes = batch.get(model)
		return [...listed(changes?.inserts), ...listed(changes?.updates)].toSorted()
	})
}

it('a list sees only the rows that lead to its pin', async () => {
	const first = await chatOf('ada')
	const second = await chatOf('bob')
	const hers = await follow('Note', first.id, inChat(first.chat))
	const his = await follow('Note', second.id, inChat(second.chat))
	const made: string[] = []
	const seen = await rowsSeen('Note', async () => {
		const notes = await Promise.all([
			noteIn(first, 'one'),
			noteIn(second, 'two'),
		])
		made.push(...notes.map(({ id }) => id))
	})
	expect(new Set(seen.map(String))).toEqual(new Set(made))
	expect(seenIn(hers)).toContain('one')
	expect(seenIn(hers)).not.toContain('two')
	expect(seenIn(his)).toContain('two')
})

it('a list pinned on two ids sees the rows of both, once', async () => {
	const ada = await User.create({ data: { name: 'ada' } }, M)
	const bob = await User.create({ data: { name: 'bob' } }, M)
	const both = await follow('User', ada.id, {
		first: 10,
		select: { name: true },
		where: { id: { in: [ada.id, bob.id] } },
	})
	const seen = await rowsSeen('User', async () =>
		Promise.all([
			User.update({ where: { id: ada.id }, data: { name: 'ada2' } }, M),
			User.update({ where: { id: bob.id }, data: { name: 'bob2' } }, M),
		]),
	)
	expect(seen).toEqual([[ada.id, bob.id].toSorted()])
	expect(seenIn(both)).toContain('ada2')
	expect(seenIn(both)).toContain('bob2')
})

it('a walk answers the reads that ask where it led, with no query', async () => {
	const loader = new Loader()
	const step = {
		relation: 'notes',
		many: true,
		target: 'Note',
		inverse: 'chat',
		keyOnTarget: true,
	}
	loader.lead('Chat', [step], new Map([['n', ['a']]]))
	loader.lead('Chat', [step], new Map([['m', ['a', 'b']]]))
	await expect(loader.reaching('Chat', [step], ['n', 'm'])).resolves.toEqual([
		'a',
		'b',
	])
})
