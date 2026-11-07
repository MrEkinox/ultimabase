// What the live reads of one flush share (D-262): a relation's rule that only
// repeats its parent's leaves the read, and those asking the same read together.
import { asUser } from '@ultimabase/testing'
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest'
import type { Nested, Read } from './adapter.ts'
import type { Adapter, Caller, Row } from './index.ts'
import { defineApp, defineModel, master, memory } from './index.ts'
import type { Judge } from './internal.ts'
import { liveReader, SharedReads, storedRows } from './internal.ts'

const M = { as: master }
const idOf = (caller: Caller): string =>
	caller.kind === 'user' ? caller.user.id : ''
const member = (caller: Caller) => ({
	members: { some: { name: { equals: idOf(caller) } } },
})

const Room = defineModel({
	name: 'Room',
	fields: (f) => ({
		name: f.string(),
		members: f.many(() => Member, { inverse: 'room' }),
		msgs: f.many(() => Msg, { inverse: 'room' }),
		notes: f.many(() => Note, { inverse: 'room' }),
		tags: f.many(() => Tag, { inverse: 'rooms' }),
		owner: f.one(() => Owner),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where(member(caller)),
	},
})
/** Its rule is the room's, seen from below. */
const Member = defineModel({
	name: 'Member',
	fields: (f) => ({ name: f.string(), room: f.one(() => Room) }),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where({ room: { is: member(caller) } }),
	},
})
const Msg = defineModel({
	name: 'Msg',
	fields: (f) => ({
		text: f.string(),
		room: f.one(() => Room),
		parts: f.many(() => Part, { inverse: 'msg' }),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where({ room: { is: member(caller) } }),
	},
})
/** Two levels down, its rule is still the room's. */
const Part = defineModel({
	name: 'Part',
	fields: (f) => ({ url: f.string(), msg: f.one(() => Msg) }),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where({ msg: { is: { room: { is: member(caller) } } } }),
	},
})
/** A note shows to its writer alone: the room's rule says nothing of that. */
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ writer: f.string(), room: f.one(() => Room) }),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where({
				writer: { equals: idOf(caller) },
				room: { is: member(caller) },
			}),
	},
})
/** The rooms hold no key of a tag: a rule through them is no parent's. */
const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({
		name: f.string(),
		rooms: f.many(() => Room, { inverse: 'tags' }),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where({ rooms: { some: member(caller) } }),
	},
})
/** The room holds the key of its owner, who shows to their own name. */
const Owner = defineModel({
	name: 'Owner',
	fields: (f) => ({ name: f.string() }),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where({ name: { equals: idOf(caller) } }),
	},
})

let adapterReads: Read[] = []
const database = memory()
const counted: Adapter = {
	...database,
	find: async (read) => {
		adapterReads.push(read)
		return database.find(read)
	},
}
const app = defineApp({
	database: counted,
	models: [Room, Member, Msg, Part, Note, Tag, Owner],
})

const ada = asUser({ id: 'ada' })
const bob = asUser({ id: 'bob' })
const verdict =
	(...passing: readonly string[]): Judge =>
	async () =>
		new Set(passing)

let hers = ''
let his = ''
let ids: readonly string[] = []
let rows: ReadonlyMap<string, Row> = new Map()

const roomOf = async (name: string): Promise<string> => {
	const owner = await Owner.create({ data: { name } }, M)
	const data = { name, owner: { connect: { id: owner.id } } }
	const { id } = await Room.create({ data }, M)
	const room = { connect: { id } }
	await Member.create({ data: { name, room } }, M)
	const msg = await Msg.create({ data: { text: name, room } }, M)
	const part = { url: name, msg: { connect: { id: msg.id } } }
	await Part.create({ data: part }, M)
	await Note.create({ data: { writer: name, room } }, M)
	await Note.create({ data: { writer: 'nobody', room } }, M)
	const rooms = { connect: [{ id }] }
	await Tag.create({ data: { name, rooms } }, M)
	return id
}

beforeAll(async () => {
	await app.start()
	hers = await roomOf('ada')
	his = await roomOf('bob')
	ids = [hers, his]
	const stored = await storedRows('Room', {})
	rows = new Map(stored.map((row) => [row.id, row]))
})
afterAll(async () => app.stop())
beforeEach(() => {
	adapterReads = []
})

const unsure: Judge = async () => undefined
const row = (id: string): Row => ({ id })
const none = async (): Promise<readonly Row[]> => []
const failing = async (): Promise<readonly Row[]> => {
	throw new Error('down')
}

const rooms = (read: Read): boolean => read.model === 'Room'
const roomReads = (): readonly Read[] => adapterReads.filter(rooms)
const nestedOf = (name: string): Nested | undefined =>
	roomReads()[0]?.include?.[name]

const members = { select: { id: true, members: { select: { name: true } } } }
const deep = {
	select: {
		id: true,
		msgs: {
			select: { text: true, parts: { select: { url: true } } },
		},
	},
}

describe('a relation rule repeating its parent', () => {
	it('leaves the read, which one statement answers for every viewer', async () => {
		const reads = new SharedReads()
		const hersRead = await liveReader('Room', members, ada)
		const hisRead = await liveReader('Room', members, bob)
		adapterReads = []
		expect(await hersRead(ids, rows, reads, verdict(hers))).toEqual([
			{ id: hers, members: [{ name: 'ada' }] },
		])
		expect(await hisRead(ids, rows, reads, verdict(his))).toEqual([
			{ id: his, members: [{ name: 'bob' }] },
		])
		expect(roomReads()).toHaveLength(1)
		expect(nestedOf('members')?.where).toBeUndefined()
	})

	it('leaves it at every level', async () => {
		const reads = new SharedReads()
		const reader = await liveReader('Room', deep, ada)
		adapterReads = []
		expect(await reader(ids, rows, reads, verdict(hers))).toEqual([
			{ id: hers, msgs: [{ text: 'ada', parts: [{ url: 'ada' }] }] },
		])
		const msgs = nestedOf('msgs')
		expect(msgs?.where).toBeUndefined()
		expect(msgs?.include?.['parts']?.where).toBeUndefined()
	})

	it('shows nothing of a row the viewer may not read', async () => {
		const reads = new SharedReads()
		const reader = await liveReader('Room', members, ada)
		expect(await reader([his], rows, reads, verdict())).toEqual([])
	})

	it('shows what findMany does, whichever way the rule is checked', async () => {
		const expected = await Room.findMany(
			{ ...deep, where: { id: { in: [...ids] } } },
			{ as: ada },
		)
		const reader = await liveReader('Room', deep, ada)
		expect(await reader(ids)).toEqual(expected)
		expect(await reader(ids, rows, new SharedReads(), unsure)).toEqual(expected)
		expect(await reader(ids, undefined, new SharedReads())).toEqual(expected)
	})
})

describe('a relation rule saying more', () => {
	const notes = { select: { id: true, notes: { select: { writer: true } } } }

	it('stays, keeping one read each', async () => {
		const reads = new SharedReads()
		const hersRead = await liveReader('Room', notes, ada)
		const hisRead = await liveReader('Room', notes, bob)
		adapterReads = []
		expect(await hersRead(ids, rows, reads, verdict(hers, his))).toEqual([
			{ id: hers, notes: [{ writer: 'ada' }] },
			{ id: his, notes: [] },
		])
		expect(await hisRead(ids, rows, reads, verdict(hers, his))).toEqual([
			{ id: hers, notes: [] },
			{ id: his, notes: [{ writer: 'bob' }] },
		])
		expect(roomReads()).toHaveLength(2)
		expect(nestedOf('notes')?.where).toEqual({
			writer: { equals: 'ada' },
		})
	})

	it('stays when the relation is many on both sides', async () => {
		const shape = { select: { id: true, tags: { select: { name: true } } } }
		const reader = await liveReader('Room', shape, ada)
		adapterReads = []
		await reader(ids, rows, new SharedReads(), verdict(hers))
		expect(nestedOf('tags')?.where).toBeDefined()
	})

	it('stays when the row holds the key', async () => {
		const shape = { select: { id: true, owner: { select: { name: true } } } }
		const reader = await liveReader('Room', shape, ada)
		adapterReads = []
		expect(
			await reader(ids, rows, new SharedReads(), verdict(hers, his)),
		).toEqual([
			{ id: hers, owner: { name: 'ada' } },
			{ id: his, owner: null },
		])
		expect(nestedOf('owner')?.where).toBeDefined()
	})

	it('stays when it asks more of the parent than its rule', async () => {
		const shape = {
			select: {
				id: true,
				members: {
					select: { name: true },
					where: { room: { is: { name: { equals: 'ada' } } } },
				},
			},
		}
		const reader = await liveReader('Room', shape, ada)
		adapterReads = []
		expect(await reader(ids, rows, new SharedReads(), verdict(hers))).toEqual([
			{ id: hers, members: [{ name: 'ada' }] },
		])
		expect(JSON.stringify(nestedOf('members')?.where)).toContain('"ada"')
	})

	it('reads a count per viewer, which it does not spare', async () => {
		const reader = await liveReader(
			'Room',
			{ select: { id: true, _count: { select: { members: true } } } },
			ada,
		)
		const reads = new SharedReads()
		reads.expect('Room', ids)
		adapterReads = []
		await reader([hers], rows, reads, verdict(hers))
		expect(roomReads()[0]?.where).toEqual({ id: { in: [hers] } })
	})
})

const reader =
	(asked: (readonly string[])[]) =>
	async (part: readonly string[]): Promise<readonly Row[]> => {
		asked.push(part)
		return part.map(row)
	}

describe('the reads of one flush', () => {
	it('read what a flush expects together, once for each key', async () => {
		const reads = new SharedReads()
		const asked: (readonly string[])[] = []
		reads.expect('Room', ['a', 'b'])
		reads.expect('Room', ['c'])
		const read = reader(asked)
		expect(await reads.rows('k', 'Room', ['a'], true, read)).toEqual([row('a')])
		expect(await reads.rows('k', 'Room', ['b', 'c'], true, read)).toEqual([
			row('b'),
			row('c'),
		])
		expect(asked).toEqual([['a', 'b', 'c']])
		await reads.rows('other', 'Room', ['c'], true, read)
		expect(asked[1]).toEqual(['c', 'a', 'b'])
	})

	it('read only what a read naming its viewer asks', async () => {
		const reads = new SharedReads()
		const asked: (readonly string[])[] = []
		reads.expect('Room', ['a', 'b'])
		await reads.rows('k', 'Room', ['a'], false, reader(asked))
		await reads.rows('k', 'Room', ['a', 'b'], false, reader(asked))
		expect(asked).toEqual([['a'], ['b']])
	})

	it('hold a statement to its size, the rest for the next one asked', async () => {
		const reads = new SharedReads()
		const asked: (readonly string[])[] = []
		const every = Array.from({ length: 1500 }, (_, at) => `${at}`)
		reads.expect('Room', every)
		await reads.rows('k', 'Room', ['0'], true, reader(asked))
		await reads.rows('k', 'Room', ['1499'], true, reader(asked))
		expect(asked.map((part) => part.length)).toEqual([1000, 500])
	})

	it('leave out a row the statement did not find', async () => {
		const reads = new SharedReads()
		expect(await reads.rows('k', 'Room', ['a'], true, none)).toEqual([])
	})

	it('fail for all who share a read that fails', async () => {
		const reads = new SharedReads()
		const first = reads.rows('k', 'Room', ['a'], true, failing)
		await expect(first).rejects.toThrow('down')
		await expect(reads.rows('k', 'Room', ['a'], true, failing)).rejects.toThrow(
			'down',
		)
	})
})

describe('the same read in one statement', () => {
	const read: Read = { model: 'Thing' }
	const when = new Date('2026-11-07T00:00:00Z')
	const stored = {
		id: 'a',
		name: 'A',
		when,
		list: [{ deep: when }],
		bytes: new Uint8Array([1]),
		none: null,
	}
	const reads = (
		find: Adapter['find'] = async () => [stored],
		aggregate: Adapter['aggregate'] = async () => [[when, 1]],
		count: Adapter['count'] = async () => 1,
	) => ({ find, aggregate, count })

	it('sends one statement for reads asked at once or later', async () => {
		const find = vi.fn<Adapter['find']>(async () => [stored])
		const over = new SharedReads().over(reads(find))
		await Promise.all([over.find(read), over.find({ ...read })])
		await over.find(read)
		expect(find).toHaveBeenCalledTimes(1)
		await over.find({ ...read, take: 1 })
		expect(find).toHaveBeenCalledTimes(2)
	})

	it('tells values JSON would confuse apart', async () => {
		const find = vi.fn<Adapter['find']>(async () => [])
		const over = new SharedReads().over(reads(find))
		for (const value of [null, Infinity, -Infinity, Number.NaN, 1n, '1']) {
			await over.find({ ...read, where: { value: { equals: value } } })
		}
		expect(find).toHaveBeenCalledTimes(6)
	})

	it('gives each reader a copy of its own', async () => {
		const over = new SharedReads().over(reads())
		const [one, two] = await Promise.all([over.find(read), over.find(read)])
		expect(one).toEqual([stored])
		expect(two).toEqual([stored])
		const mine = one[0]
		expect(mine).not.toBe(two[0])
		expect(mine?.['when']).not.toBe(stored.when)
		expect(mine?.['list']).not.toBe(stored.list)
		expect(mine?.['bytes']).not.toBe(stored.bytes)
		const groups = await over.aggregate({ model: 'Thing', aggregates: [] })
		const first = groups[0]?.[0]
		expect(first).toEqual(when)
		expect(first).not.toBe(when)
	})

	it('shares a count and an aggregate', async () => {
		const count = vi.fn<Adapter['count']>(async () => 3)
		const aggregate = vi.fn<Adapter['aggregate']>(async () => [[1]])
		const over = new SharedReads().over(reads(undefined, aggregate, count))
		await over.count({ model: 'Thing' })
		await over.count({ model: 'Thing' })
		expect(count).toHaveBeenCalledTimes(1)
		await over.aggregate({ model: 'Thing', aggregates: [] })
		await over.aggregate({ model: 'Thing', aggregates: [] })
		expect(aggregate).toHaveBeenCalledTimes(1)
	})

	it('sends a failed read again', async () => {
		const find = vi
			.fn<Adapter['find']>(async () => [stored])
			.mockRejectedValueOnce(new Error('Broken.'))
		const over = new SharedReads().over(reads(find))
		const [one, two] = await Promise.allSettled([
			over.find(read),
			over.find(read),
		])
		expect(one.status).toBe('rejected')
		expect(two.status).toBe('rejected')
		await expect(over.find(read)).resolves.toEqual([stored])
		expect(find).toHaveBeenCalledTimes(2)
	})

	it('reads what is stored once stopped', async () => {
		const find = vi.fn<Adapter['find']>(async () => [stored])
		const shared = new SharedReads()
		const over = shared.over(reads(find))
		await over.find(read)
		shared.stop()
		await over.find(read)
		await over.find(read)
		expect(find).toHaveBeenCalledTimes(3)
	})
})
