// A write costs the live reads that may show it, not every connected caller
// (D-252): rules name the viewer through relations, as a real app's do.
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
const member = (caller: Caller): Filter => ({
	members: { some: { user: { is: { id: { equals: idOf(caller) } } } } },
})
const open = { access: { read: () => true } }

const User = defineModel({
	name: 'User',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		memberships: f.many(() => Member, { inverse: 'user' }),
	}),
}).with(open)
const Group = defineModel({
	name: 'Group',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		rooms: f.many(() => Room, { inverse: 'groups' }),
	}),
}).with(open)
const Room = defineModel({
	name: 'Room',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		members: f.many(() => Member, { inverse: 'room' }),
		msgs: f.many(() => Msg, { inverse: 'room' }),
		notes: f.many(() => Note, { inverse: 'room' }),
		groups: f.many(() => Group, { inverse: 'rooms' }),
	}),
}).with(open)
const Member = defineModel({
	name: 'Member',
	use: [realtime()],
	fields: (f) => ({ user: f.one(() => User), room: f.one(() => Room) }),
}).with(open)
/** A viewer reads the messages of their rooms. */
const Msg = defineModel({
	name: 'Msg',
	use: [realtime()],
	fields: (f) => ({
		text: f.string(),
		room: f.one(() => Room),
		author: f.one(() => User),
		parts: f.many(() => Part, { inverse: 'msg' }),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where({ room: { is: member(caller) } }),
	},
})
/** A viewer reads a message's parts when it is in the message's room. */
const Part = defineModel({
	name: 'Part',
	use: [realtime()],
	fields: (f) => ({ url: f.string(), msg: f.one(() => Msg) }),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where({ msg: { is: { room: { is: member(caller) } } } }),
	},
})
/** Anyone reads a note; only its room's members read its parts. */
const Note = defineModel({
	name: 'Note',
	use: [realtime()],
	fields: (f) => ({
		text: f.string(),
		room: f.one(() => Room),
		lines: f.many(() => Line, { inverse: 'note' }),
	}),
}).with(open)
const Line = defineModel({
	name: 'Line',
	use: [realtime()],
	fields: (f) => ({ text: f.string(), note: f.one(() => Note) }),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where({ note: { is: { room: { is: member(caller) } } } }),
	},
})
/** A viewer reads their own tickets and the open ones: a row answers it alone. */
const Ticket = defineModel({
	name: 'Ticket',
	use: [realtime()],
	fields: (f) => ({
		text: f.string(),
		owner: f.string(),
		open: f.boolean(),
		room: f.one(() => Room),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where({
				OR: [{ owner: { equals: idOf(caller) } }, { open: { equals: true } }],
			}),
	},
})
/** A viewer reads a sign in a room of the group named after them. */
const Sign = defineModel({
	name: 'Sign',
	use: [realtime()],
	fields: (f) => ({
		text: f.string(),
		room: f.one(() => Room),
		marks: f.many(() => Mark, { inverse: 'sign' }),
	}),
}).with(open)
const Mark = defineModel({
	name: 'Mark',
	use: [realtime()],
	fields: (f) => ({ text: f.string(), sign: f.one(() => Sign) }),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where({
				sign: {
					is: {
						room: {
							is: { groups: { some: { name: { equals: idOf(caller) } } } },
						},
					},
				},
			}),
	},
})

/** A card names its tag and empties it when the tag goes. */
const Tag = defineModel({
	name: 'Tag',
	use: [realtime()],
	fields: (f) => ({ name: f.string() }),
}).with(open)
const Card = defineModel({
	name: 'Card',
	use: [realtime()],
	fields: (f) => ({
		text: f.string(),
		tag: f.one(() => Tag, { optional: true, onDelete: 'setNull' }),
		board: f.one(() => Board, { optional: true, onDelete: 'setNull' }),
	}),
}).with(open)
const Board = defineModel({
	name: 'Board',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		cards: f.many(() => Card, { inverse: 'board' }),
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
/** The next read with relations fails. */
let breaking = false
/** How many counts the database ran. */
let counts = 0
let app: ReturnType<typeof defineApp>
beforeEach(async () => {
	const database = memory()
	const counted: Adapter = {
		...database,
		find: async (read) => {
			finds.push(read.model)
			if (breaking && read.include !== undefined) {
				breaking = false
				throw new Error('Broken.')
			}
			return database.find(read)
		},
		count: async (read) => {
			counts += 1
			return database.count(read)
		},
	}
	app = defineApp({
		database: counted,
		models: [
			User,
			Group,
			Room,
			Member,
			Msg,
			Part,
			Note,
			Line,
			Sign,
			Mark,
			Tag,
			Card,
			Board,
			Ticket,
		],
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

/** A room holding one message of one part, and a member for each name. */
async function roomOf(names: readonly string[]) {
	const room = await Room.create({ data: { name: 'room' } }, M)
	const users = await Promise.all(
		names.map(async (name) => User.create({ data: { name } }, M)),
	)
	for (const user of users) {
		await Member.create(
			{ data: { user: links(user.id), room: links(room.id) } },
			M,
		)
	}
	const [author] = users
	if (author === undefined) throw new Error('A room needs a member.')
	const msg = await Msg.create(
		{ data: { text: 'hi', room: links(room.id), author: links(author.id) } },
		M,
	)
	await Part.create({ data: { url: 'u', msg: links(msg.id) } }, M)
	return { room, users, msg, author }
}

const shown = {
	first: 10,
	select: {
		text: true,
		author: { select: { name: true } },
		parts: { take: 8, select: { url: true } },
	},
	orderBy: { text: 'asc' },
}
const inRoom = (room: { readonly id: string }) => ({
	...shown,
	where: { room: { is: { id: { equals: room.id } } } },
})

/** The reads `write` costs, once its live reads are done. */
async function readsOf(write: () => Promise<unknown>): Promise<number> {
	await quiet()
	finds = []
	await write()
	await quiet()
	return finds.length
}

it('a write in a room costs nothing more for each viewer of another room', async () => {
	const first = await roomOf(['ada'])
	const other = await roomOf(['bob', 'cy', 'dee', 'eve', 'fay'])
	const seen = await follow('Msg', first.author.id, inRoom(first.room))
	const [bob, cy, dee, eve, fay] = other.users
	const elsewhere = await follow('Msg', bob?.id ?? '', inRoom(other.room))
	/** Each of the writes a room's viewers follow, its reads in order. */
	const writes = async (round: number): Promise<number[]> => [
		await readsOf(async () =>
			Msg.update(
				{
					where: { id: first.msg.id },
					data: { text: `edited ${String(round)}` },
				},
				M,
			),
		),
		await readsOf(async () =>
			User.update(
				{
					where: { id: first.author.id },
					data: { name: `renamed ${String(round)}` },
				},
				M,
			),
		),
		await readsOf(async () =>
			Part.create({ data: { url: 'v', msg: links(first.msg.id) } }, M),
		),
		await readsOf(async () =>
			Msg.create(
				{
					data: {
						text: 'new',
						room: links(first.room.id),
						author: links(first.author.id),
					},
				},
				M,
			),
		),
	]
	const alone = await writes(1)
	for (const user of [cy, dee, eve, fay]) {
		await follow('Msg', user?.id ?? '', inRoom(other.room))
	}
	const crowded = await writes(2)
	expect(crowded).toEqual(alone)
	expect(elsewhere).toHaveLength(1)
	expect(seen.length).toBeGreaterThan(1)
})

it('a read of a room the rules refuse stays empty when the room is written', async () => {
	const { room, msg } = await roomOf(['ada'])
	const stranger = await User.create({ data: { name: 'zed' } }, M)
	const seen = await follow('Msg', stranger.id, inRoom(room))
	await Msg.update({ where: { id: msg.id }, data: { text: 'edited' } }, M)
	await quiet()
	expect(seen).toHaveLength(1)
})

/** A note of `room` with a line, followed as each of `ids`. */
async function notes(
	room: { readonly id: string },
	ids: readonly string[],
): Promise<LiveMessage[][]> {
	const note = await Note.create(
		{ data: { text: 'n', room: links(room.id) } },
		M,
	)
	await Line.create({ data: { text: 'l', note: links(note.id) } }, M)
	const args = {
		first: 10,
		select: { text: true, lines: { take: 8, select: { text: true } } },
		orderBy: { text: 'asc' },
	}
	return Promise.all(ids.map(async (id) => follow('Note', id, args)))
}

const linesOf = (message: LiveMessage | undefined): unknown =>
	JSON.stringify(message).includes('"lines":[]') ? 'none' : 'some'

it('a member leaving or joining a room changes what a relation shows them alone', async () => {
	const { room, users } = await roomOf(['ada', 'bob'])
	const [ada, bob] = users
	const [adas = [], bobs = []] = await notes(room, [
		ada?.id ?? '',
		bob?.id ?? '',
	])
	expect(linesOf(adas[0])).toBe('some')
	const where = { user: { is: { id: { equals: ada?.id ?? '' } } } }
	await Member.deleteMany({ where }, M)
	await vi.waitFor(() => expect(adas).toHaveLength(2))
	expect(linesOf(adas[1])).toBe('none')
	expect(bobs).toHaveLength(1)
	await Member.create(
		{ data: { user: links(ada?.id ?? ''), room: links(room.id) } },
		M,
	)
	await vi.waitFor(() => expect(adas).toHaveLength(3))
	expect(linesOf(adas[2])).toBe('some')
	expect(bobs).toHaveLength(1)
})

it('a member moved to another room loses what a relation shows them', async () => {
	const { room, users } = await roomOf(['ada'])
	const away = await Room.create({ data: { name: 'away' } }, M)
	const [ada] = users
	const [adas = []] = await notes(room, [ada?.id ?? ''])
	const where = { user: { is: { id: { equals: ada?.id ?? '' } } } }
	const [membership] = await Member.findMany({ where }, M)
	await Member.update(
		{ where: { id: membership?.id ?? '' }, data: { room: links(away.id) } },
		M,
	)
	await vi.waitFor(() => expect(adas).toHaveLength(2))
	expect(linesOf(adas[1])).toBe('none')
})

it('a link lost between two rows the filter reaches changes what a relation shows', async () => {
	const room = await Room.create({ data: { name: 'room' } }, M)
	const group = await Group.create(
		{ data: { name: 'ada', rooms: { connect: [{ id: room.id }] } } },
		M,
	)
	const sign = await Sign.create(
		{ data: { text: 's', room: links(room.id) } },
		M,
	)
	await Mark.create({ data: { text: 'm', sign: links(sign.id) } }, M)
	const args = {
		first: 10,
		select: { text: true, marks: { take: 8, select: { text: true } } },
		orderBy: { text: 'asc' },
	}
	const seen = await follow('Sign', 'ada', args)
	expect(JSON.stringify(seen[0])).toContain('"text":"m"')
	await Group.update(
		{
			where: { id: group.id },
			data: { rooms: { disconnect: [{ id: room.id }] } },
		},
		M,
	)
	await vi.waitFor(() => expect(seen).toHaveLength(2))
	expect(JSON.stringify(seen[1])).toContain('"marks":[]')
})

it('a message leaves the list of who loses a link its rule reaches', async () => {
	const room = await Room.create({ data: { name: 'room' } }, M)
	const group = await Group.create(
		{ data: { name: 'ada', rooms: { connect: [{ id: room.id }] } } },
		M,
	)
	const sign = await Sign.create(
		{ data: { text: 's', room: links(room.id) } },
		M,
	)
	const seen = await follow('Sign', 'ada', {
		first: 10,
		select: { text: true },
		orderBy: { text: 'asc' },
		where: {
			room: { is: { groups: { some: { name: { equals: 'ada' } } } } },
		},
	})
	expect(JSON.stringify(seen[0])).toContain(sign.id)
	await Group.update(
		{
			where: { id: group.id },
			data: { rooms: { disconnect: [{ id: room.id }] } },
		},
		M,
	)
	await vi.waitFor(() => expect(seen).toHaveLength(2))
	expect(JSON.stringify(seen[1])).toContain('remove')
})

it('finds the rows a write shows past what one read of a flush holds', async () => {
	const { room, author } = await roomOf(['ada'])
	const data = Array.from({ length: 10_001 }, (_, at) => ({
		text: `m${at}`,
		room: links(room.id),
		author: links(author.id),
	}))
	await Msg.createMany({ data }, M)
	const seen = await follow('Msg', author.id, { ...inRoom(room), first: 3 })
	await User.update({ where: { id: author.id }, data: { name: 'renamed' } }, M)
	await vi.waitFor(() => expect(seen).toHaveLength(2))
	expect(JSON.stringify(seen[1])).toContain('renamed')
})

// #200
it('a row read again as it was sent is not sent again', async () => {
	const { room, author, msg } = await roomOf(['ada'])
	const seen = await follow('Msg', author.id, inRoom(room))
	await quiet()
	await User.update({ where: { id: author.id }, data: { name: 'ada' } }, M)
	await quiet()
	expect(seen).toHaveLength(1)
	await Msg.update({ where: { id: msg.id }, data: { text: 'edited' } }, M)
	await vi.waitFor(() => expect(seen).toHaveLength(2))
	expect(JSON.stringify(seen[1])).toContain('edited')
})

it('a row moved is sent though it reads the same', async () => {
	const { room, author, msg } = await roomOf(['ada'])
	const other = await Msg.create(
		{ data: { text: 'mid', room: links(room.id), author: links(author.id) } },
		M,
	)
	const seen = await follow('Msg', author.id, {
		first: 10,
		select: { room: { select: { name: true } } },
		orderBy: { text: 'asc' },
		where: { room: { is: { id: { equals: room.id } } } },
	})
	await quiet()
	await Msg.update({ where: { id: msg.id }, data: { text: 'zz' } }, M)
	await vi.waitFor(() => expect(seen).toHaveLength(2))
	expect(seen[1]).toMatchObject({
		changes: [{ upsert: { id: msg.id }, after: other.id }],
	})
})

// D-252: nothing remembers which row showed which; what a write says is enough.
const withParts = {
	first: 10,
	select: { text: true, parts: { take: 8, select: { url: true } } },
	orderBy: { text: 'asc' },
}
const counting = {
	first: 10,
	select: { text: true, _count: { select: { parts: true } } },
	orderBy: { text: 'asc' },
}

it('a deleted row with the key on its side sends its parent again', async () => {
	const { room, author, msg } = await roomOf(['ada'])
	const other = await Msg.create(
		{ data: { text: 'yo', room: links(room.id), author: links(author.id) } },
		M,
	)
	const part = await Part.create({ data: { url: 'x', msg: links(msg.id) } }, M)
	const seen = await follow('Msg', author.id, withParts)
	await quiet()
	await Part.deleteMany({ where: { id: { equals: part.id } } }, M)
	await vi.waitFor(() => expect(seen).toHaveLength(2))
	const sent = JSON.stringify(seen[1])
	expect(sent).toContain(msg.id)
	expect(sent).not.toContain(other.id)
	expect(sent).not.toContain('"x"')
})

it('a row a key moved away from is sent with the row it moved to', async () => {
	const { room, author, msg } = await roomOf(['ada'])
	const other = await Msg.create(
		{ data: { text: 'yo', room: links(room.id), author: links(author.id) } },
		M,
	)
	const part = await Part.create({ data: { url: 'x', msg: links(msg.id) } }, M)
	const seen = await follow('Msg', author.id, withParts)
	await quiet()
	await Part.update(
		{ where: { id: part.id }, data: { msg: links(other.id) } },
		M,
	)
	await vi.waitFor(() => expect(seen).toHaveLength(2))
	const sent = JSON.stringify(seen[1])
	expect(sent).toContain('"text":"hi"')
	expect(sent).toContain('"text":"yo"')
})

it('a row deleted at depth sends the root row above it again', async () => {
	const { room, author, msg } = await roomOf(['ada'])
	const part = await Part.create({ data: { url: 'x', msg: links(msg.id) } }, M)
	const seen = await follow('Room', author.id, {
		first: 10,
		select: {
			name: true,
			msgs: { take: 8, select: { parts: { take: 8, select: { url: true } } } },
		},
		orderBy: { name: 'asc' },
	})
	await quiet()
	await Part.deleteMany({ where: { id: { equals: part.id } } }, M)
	await vi.waitFor(() => expect(seen).toHaveLength(2))
	expect(JSON.stringify(seen[1])).toContain(room.id)
	expect(JSON.stringify(seen[1])).not.toContain('"x"')
})

it('a count at depth falls when a row it counts is deleted', async () => {
	const { room, author, msg } = await roomOf(['ada'])
	const part = await Part.create({ data: { url: 'x', msg: links(msg.id) } }, M)
	const seen = await follow('Room', author.id, {
		first: 10,
		select: {
			msgs: { take: 8, select: { _count: { select: { parts: true } } } },
		},
		orderBy: { name: 'asc' },
	})
	await quiet()
	await Part.deleteMany({ where: { id: { equals: part.id } } }, M)
	await vi.waitFor(() => expect(seen).toHaveLength(2))
	expect(JSON.stringify(seen[1])).toContain(room.id)
	expect(JSON.stringify(seen[1])).toContain('"parts":1')
})

it('a count falls when a row it counts is deleted', async () => {
	const { author, msg } = await roomOf(['ada'])
	const part = await Part.create({ data: { url: 'x', msg: links(msg.id) } }, M)
	const seen = await follow('Msg', author.id, counting)
	await quiet()
	await Part.deleteMany({ where: { id: { equals: part.id } } }, M)
	await vi.waitFor(() => expect(seen).toHaveLength(2))
	expect(JSON.stringify(seen[1])).toContain('"parts":1')
})

it('a many-to-many target deleted sends the rows that showed it again', async () => {
	const { room, author } = await roomOf(['ada'])
	const group = await Group.create(
		{ data: { name: 'gone', rooms: { connect: [{ id: room.id }] } } },
		M,
	)
	const seen = await follow('Room', author.id, {
		first: 10,
		select: { name: true, groups: { take: 8, select: { name: true } } },
		orderBy: { name: 'asc' },
	})
	await vi.waitFor(() => expect(JSON.stringify(seen[0])).toContain('gone'))
	await quiet()
	await Group.deleteMany({ where: { id: { equals: group.id } } }, M)
	await vi.waitFor(() => expect(seen).toHaveLength(2))
	expect(JSON.stringify(seen[1])).toContain(room.id)
	expect(JSON.stringify(seen[1])).not.toContain('gone')
})

it('a stored target deleted empties the rows that showed it', async () => {
	const { author } = await roomOf(['ada'])
	const tag = await Tag.create({ data: { name: 'gone' } }, M)
	const board = await Board.create({ data: { name: 'b' } }, M)
	await Card.create(
		{ data: { text: 'c', tag: links(tag.id), board: links(board.id) } },
		M,
	)
	const select = { text: true, tag: { select: { name: true } } }
	const cards = await follow('Card', author.id, {
		first: 10,
		select,
		orderBy: { text: 'asc' },
	})
	const boards = await follow('Board', author.id, {
		first: 10,
		select: { name: true, cards: { take: 8, select } },
		orderBy: { name: 'asc' },
	})
	await quiet()
	await Tag.deleteMany({ where: { id: { equals: tag.id } } }, M)
	await vi.waitFor(() => {
		expect(cards).toHaveLength(2)
		expect(boards).toHaveLength(2)
	})
	expect(JSON.stringify(cards[1])).not.toContain('gone')
	expect(JSON.stringify(boards[1])).not.toContain('gone')
})

/** A room's ticket `owner` holds, and what a live list of tickets shows. */
async function ticketOf(owner: string, isOpen: boolean) {
	const room = await Room.create({ data: { name: 'room' } }, M)
	const ticket = await Ticket.create(
		{ data: { text: 't', owner, open: isOpen, room: links(room.id) } },
		M,
	)
	const args = {
		first: 10,
		select: { text: true, room: { select: { name: true } } },
		orderBy: { text: 'asc' },
	}
	return { ticket, args }
}

it('a row is read once for its viewers, whoever a rule it answers alone names', async () => {
	const { ticket, args } = await ticketOf('ada', true)
	const edit = (text: string) => async () =>
		Ticket.update({ where: { id: ticket.id }, data: { text } }, M)
	const ada = await follow('Ticket', 'ada', args)
	const alone = await readsOf(edit('one'))
	await vi.waitFor(() => expect(ada).toHaveLength(2))
	const others = await Promise.all(
		['bob', 'cy', 'dee', 'eve'].map(async (id) => follow('Ticket', id, args)),
	)
	expect(await readsOf(edit('two'))).toBe(alone)
	for (const seen of others) {
		await vi.waitFor(() =>
			expect(JSON.stringify(seen.at(-1))).toContain('"text":"two"'),
		)
	}
})

it('a rule a row answers alone still decides, on a field nobody selected', async () => {
	const { ticket, args } = await ticketOf('ada', false)
	const ada = await follow('Ticket', 'ada', args)
	const bob = await follow('Ticket', 'bob', args)
	expect(JSON.stringify(bob[0])).not.toContain('"text":"t"')
	await readsOf(async () =>
		Ticket.update({ where: { id: ticket.id }, data: { text: 'mine' } }, M),
	)
	await vi.waitFor(() =>
		expect(JSON.stringify(ada.at(-1))).toContain('"text":"mine"'),
	)
	expect(bob).toHaveLength(1)
	await readsOf(async () =>
		Ticket.update({ where: { id: ticket.id }, data: { open: true } }, M),
	)
	await vi.waitFor(() =>
		expect(JSON.stringify(bob.at(-1))).toContain('"text":"mine"'),
	)
})

it('a rule naming the viewer through a relation keeps one read each', async () => {
	const { room, users, msg, author } = await roomOf(['ada', 'bob'])
	const edit = (text: string) => async () =>
		Msg.update({ where: { id: msg.id }, data: { text } }, M)
	await follow('Msg', author.id, inRoom(room))
	const alone = await readsOf(edit('one'))
	await follow('Msg', users[1]?.id ?? '', inRoom(room))
	expect(await readsOf(edit('two'))).toBeGreaterThan(alone)
})

it('a shared read that fails sends each of its lists whole again', async () => {
	const { ticket, args } = await ticketOf('ada', true)
	const ada = await follow('Ticket', 'ada', args)
	const bob = await follow('Ticket', 'bob', args)
	breaking = true
	await Ticket.update({ where: { id: ticket.id }, data: { text: 'next' } }, M)
	for (const seen of [ada, bob]) {
		await vi.waitFor(() => {
			expect(seen.at(-1)).toMatchObject({
				kind: 'reset',
				rows: [{ text: 'next' }],
			})
		})
	}
})

it('a flush counts once for the lists with the same filter', async () => {
	const { args } = await ticketOf('ada', true)
	const counted = { ...args, totalCount: true }
	const room = await Room.create({ data: { name: 'other' } }, M)
	const lists = [
		await follow('Note', 'ada', { first: 2, totalCount: true }),
		await follow('Note', 'bob', { first: 2, totalCount: true }),
		await follow('Note', 'cy', { first: 2, totalCount: true }),
	]
	const named = [
		await follow('Ticket', 'ada', counted),
		await follow('Ticket', 'bob', counted),
	]
	await quiet()
	counts = 0
	await Note.create({ data: { text: 'n', room: links(room.id) } }, M)
	for (const seen of lists) {
		await vi.waitFor(() => {
			expect(seen.at(-1)).toMatchObject({ totalCount: 1 })
		})
	}
	expect(counts).toBe(1)
	counts = 0
	await Ticket.create(
		{ data: { text: 'u', owner: 'ada', open: true, room: links(room.id) } },
		M,
	)
	for (const seen of named) {
		await vi.waitFor(() => {
			expect(seen.at(-1)).toMatchObject({ totalCount: 2 })
		})
	}
	expect(counts).toBe(2)
})
