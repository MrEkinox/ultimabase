// The realtime plugin (D-154) on `memory()`: live lists and live rows follow
// creations, updates, deletions and the caller's rights, a row at a time,
// and close when the caller is no longer the same user.
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
	Adapter,
	Caller,
	Feed,
	Logger,
	PluginTypes,
	Row,
} from 'ultimabase'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from 'ultimabase'
import type {
	LiveHandle,
	LiveMessage,
	Realtime,
	RealtimeApi,
	RealtimeOptions,
	Viewer,
} from './index.ts'
import { realtime, realtimePlugin } from './index.ts'

const M = { as: master }

const idOf = (caller: Caller): string =>
	caller.kind === 'user' ? caller.user.id : ''

const Session = defineModel({
	name: 'Session',
	fields: (f) => ({ token: f.string({ unique: true }), user: f.string() }),
})
const Team = defineModel({
	name: 'Team',
	fields: (f) => ({
		name: f.string(),
		members: f.many(() => Member),
		posts: f.many(() => Post),
	}),
})
const Member = defineModel({
	name: 'Member',
	fields: (f) => ({ user: f.string(), team: f.one(() => Team) }),
})
const Author = defineModel({
	name: 'Author',
	fields: (f) => ({ name: f.string(), posts: f.many(() => Post) }),
	use: [realtime()],
}).with({ access: { read: () => true } })
/** A user reads the posts of the teams they belong to. */
const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		rank: f.number({ integer: true }),
		open: f.boolean({ default: true }),
		team: f.one(() => Team),
		author: f.one(() => Author, { optional: true }),
		comments: f.many(() => Comment),
	}),
	use: [realtime()],
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where({ team: { is: { members: { some: { user: idOf(caller) } } } } }),
	},
})
let failing = false
const Comment = defineModel({
	name: 'Comment',
	fields: (f) => ({ text: f.string(), post: f.one(() => Post) }),
	use: [realtime()],
}).with({
	realtime: { maxLive: 4 },
	access: { read: () => true },
	hooks: {
		beforeFind: ({ caller }) => {
			if (failing && caller.kind !== 'master') throw new Error('Broken.')
		},
	},
})
let unplanned = false
/** A user reads the notes of their teams, found by an async `beforeFind`. */
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string(), team: f.string() }),
	use: [realtime()],
}).with({
	access: { read: () => true },
	hooks: {
		beforeFind: async ({ caller, where }) => {
			if (caller.kind === 'master') return undefined
			if (unplanned) throw new Error('Unplanned.')
			const members = await Member.findMany(
				{ where: { user: idOf(caller) }, include: { team: true } },
				M,
			)
			return where({ team: { in: members.map(({ team }) => team.name) } })
		},
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

const manifest = {
	name: 'watching',
	version: '1.0.0',
	peerDependencies: { ultimabase: '*' },
}
interface Watching extends PluginTypes {
	readonly name: 'watching'
	readonly requires: Realtime
}
let api: RealtimeApi | undefined
let revoked = false
/** When the session ends, if it does. */
let ends: number | undefined
/** Keeps the realtime API; a request's `authorization` names a session. */
const watching = definePlugin<Watching>({
	name: 'watching',
	manifest,
	requires: { realtime: realtimePlugin },
	api: ({ plugins }) => {
		api = plugins.realtime
	},
	identify: async (request, context) => {
		const token = request.headers.get('authorization')
		if (token === null || revoked) return undefined
		if (ends !== undefined) {
			if (Date.now() >= ends) return undefined
			context.expires(new Date(ends))
		}
		const session = await Session.findUnique({ where: { token } }, M)
		return session === null ? undefined : asUser({ id: session.user })
	},
})

/** memory(), keeping the feed its `start` was given. */
function kept(): { readonly database: Adapter; readonly feed: () => Feed } {
	const database = memory()
	let feed: Feed | undefined
	return {
		database: {
			...database,
			start: async (schema, log, given) => {
				feed = given
				return database.start(schema, log, given)
			},
		},
		feed: () => {
			if (feed === undefined) throw new Error('No feed.')
			return feed
		},
	}
}

const models = [Session, Team, Member, Author, Post, Comment, Note]
const appOf = (options?: RealtimeOptions) => {
	const { database, feed } = kept()
	const plugins = [realtimePlugin(options), watching.plugin()]
	return { app: defineApp({ database, models, plugins, logger }), feed }
}

const request = (token?: string): Request =>
	new Request('http://localhost/', {
		headers: token === undefined ? {} : { authorization: token },
	})

const connect = async (token = 'ada-token'): Promise<Viewer> => {
	if (api === undefined) throw new Error('No realtime API.')
	return api.connect(request(token))
}

type Followed = { readonly seen: LiveMessage[]; readonly handle: LiveHandle }

const list = async (
	viewer: Viewer,
	model: string,
	args: unknown,
): Promise<Followed> => {
	const seen: LiveMessage[] = []
	const handle = await viewer.list(model, args, (message) => seen.push(message))
	return { seen, handle }
}

/** The `count`th message, once it came. */
const message = async (
	seen: readonly LiveMessage[],
	count: number,
): Promise<LiveMessage | undefined> => {
	await vi.waitFor(() => expect(seen).toHaveLength(count))
	return seen[count - 1]
}

const titled = (title: string): unknown => expect.objectContaining({ title })

let running: ReturnType<typeof appOf>
let one: { readonly id: string }
let two: { readonly id: string }
let posts: Row[]

async function seeded(options?: RealtimeOptions): Promise<void> {
	running = appOf(options)
	await running.app.start()
	await Session.create({ data: { token: 'ada-token', user: 'ada' } }, M)
	one = { id: (await Team.create({ data: { name: 'One' } }, M)).id }
	two = { id: (await Team.create({ data: { name: 'Two' } }, M)).id }
	await Member.create({ data: { user: 'ada', team: { connect: one } } }, M)
	posts = []
	for (const [rank, team] of [one, one, one, one, two].entries()) {
		const data = {
			title: `p${rank + 1}`,
			rank: rank + 1,
			team: { connect: team },
		}
		posts.push(await Post.create({ data }, M))
	}
}

const ranked = { orderBy: { rank: 'asc' }, select: { title: true } }

beforeEach(() => {
	errors.length = 0
	failing = false
	unplanned = false
	revoked = false
	ends = undefined
})
afterEach(async () => {
	await running.app.stop()
})

describe('a live list', () => {
	beforeEach(async () => seeded())

	it('starts with its first rows, whether more follow and their count', async () => {
		const { seen } = await list(await connect(), 'Post', {
			...ranked,
			first: 2,
			totalCount: true,
		})
		expect(seen).toEqual([
			{
				kind: 'reset',
				revision: 1,
				rows: [
					{ id: posts[0]?.id, title: 'p1' },
					{ id: posts[1]?.id, title: 'p2' },
				],
				hasMore: true,
				totalCount: 4,
			},
		])
	})

	it('places a created row and drops the one it pushes out', async () => {
		const { seen } = await list(await connect(), 'Post', {
			...ranked,
			first: 2,
			totalCount: true,
		})
		await Post.create(
			{ data: { title: 'p0', rank: 0, team: { connect: one } } },
			M,
		)
		expect(await message(seen, 2)).toEqual({
			kind: 'changes',
			revision: 2,
			changes: [
				{ remove: posts[1]?.id, gone: false },
				{ upsert: titled('p0'), after: null },
			],
			totalCount: 5,
		})
	})

	it('counts a row created past its window without sending it', async () => {
		const { seen } = await list(await connect(), 'Post', {
			...ranked,
			first: 2,
			totalCount: true,
		})
		await Post.create(
			{ data: { title: 'p9', rank: 9, team: { connect: one } } },
			M,
		)
		expect(await message(seen, 2)).toEqual({
			kind: 'changes',
			revision: 2,
			changes: [],
			totalCount: 5,
		})
	})

	it('removes a deleted row and shows the next', async () => {
		const { seen } = await list(await connect(), 'Post', {
			...ranked,
			first: 2,
			totalCount: true,
		})
		await Post.delete({ where: { id: posts[0]?.id ?? '' } }, M)
		expect(await message(seen, 2)).toEqual({
			kind: 'changes',
			revision: 2,
			changes: [
				{ remove: posts[0]?.id, gone: true },
				{ upsert: titled('p3'), after: posts[1]?.id },
			],
			totalCount: 3,
		})
	})

	it('moves an updated row to its place', async () => {
		const { seen } = await list(await connect(), 'Post', {
			...ranked,
			first: 2,
		})
		await Post.update(
			{ where: { id: posts[2]?.id ?? '' }, data: { rank: 0 } },
			M,
		)
		expect(await message(seen, 2)).toEqual({
			kind: 'changes',
			revision: 2,
			changes: [
				{ remove: posts[1]?.id, gone: false },
				{ upsert: titled('p3'), after: null },
			],
		})
	})

	it('sends a row again when a field it shows changes, alone', async () => {
		const { seen } = await list(await connect(), 'Post', {
			...ranked,
			first: 2,
		})
		await Post.update(
			{ where: { id: posts[3]?.id ?? '' }, data: { title: 'q4' } },
			M,
		)
		await Post.update(
			{ where: { id: posts[1]?.id ?? '' }, data: { title: 'q2' } },
			M,
		)
		expect(await message(seen, 2)).toEqual({
			kind: 'changes',
			revision: 2,
			changes: [{ upsert: titled('q2'), after: posts[0]?.id }],
		})
	})

	it('removes a row that leaves its filter, which may come back', async () => {
		const { seen } = await list(await connect(), 'Post', {
			...ranked,
			where: { open: true },
			first: 2,
			totalCount: true,
		})
		await Post.update(
			{ where: { id: posts[0]?.id ?? '' }, data: { open: false } },
			M,
		)
		expect(await message(seen, 2)).toEqual({
			kind: 'changes',
			revision: 2,
			changes: [
				{ remove: posts[0]?.id, gone: false },
				{ upsert: titled('p3'), after: posts[1]?.id },
			],
			totalCount: 3,
		})
	})

	it('says when no more rows follow', async () => {
		const { seen } = await list(await connect(), 'Post', {
			...ranked,
			first: 3,
		})
		await Post.delete({ where: { id: posts[3]?.id ?? '' } }, M)
		expect(await message(seen, 2)).toEqual({
			kind: 'changes',
			revision: 2,
			changes: [],
			hasMore: false,
		})
	})

	it('grows by the rows asked for, up to the limit', async () => {
		const { seen, handle } = await list(await connect(), 'Post', {
			...ranked,
			first: 2,
		})
		await handle.grow(2)
		expect(seen.at(-1)).toEqual({
			kind: 'changes',
			revision: 2,
			changes: [
				{ upsert: titled('p3'), after: posts[1]?.id },
				{ upsert: titled('p4'), after: posts[2]?.id },
			],
			hasMore: false,
		})
		await expect(handle.grow(0)).rejects.toThrow(
			'first must be a positive integer.',
		)
		await expect(handle.grow(1000)).rejects.toThrow(
			'first is over 1000, the most a live list follows.',
		)
	})

	it('stops when its handle closes', async () => {
		const viewer = await connect()
		const closed = await list(viewer, 'Post', { ...ranked, first: 2 })
		const open = await list(viewer, 'Post', { ...ranked, first: 1 })
		closed.handle.close()
		await Post.create(
			{ data: { title: 'p0', rank: 0, team: { connect: one } } },
			M,
		)
		await message(open.seen, 2)
		expect(closed.seen).toHaveLength(1)
	})

	it('reads its window again when changes were missed or not listed', async () => {
		const { seen } = await list(await connect(), 'Post', {
			...ranked,
			first: 1,
		})
		running.feed().missed()
		expect(await message(seen, 2)).toMatchObject({ kind: 'reset', revision: 2 })
		running.feed().changed([{ kind: 'update', model: 'Post' }])
		expect(await message(seen, 3)).toMatchObject({ kind: 'reset', revision: 3 })
	})
})

describe('the rights of a live list', () => {
	beforeEach(async () => seeded())

	it('removes the rows its caller can no longer read, gone', async () => {
		const { seen } = await list(await connect(), 'Post', {
			...ranked,
			first: 2,
			totalCount: true,
		})
		await Member.deleteMany({ where: { user: 'ada' } }, M)
		expect(await message(seen, 2)).toEqual({
			kind: 'changes',
			revision: 2,
			changes: [
				{ remove: posts[0]?.id, gone: true },
				{ remove: posts[1]?.id, gone: true },
			],
			hasMore: false,
			totalCount: 0,
		})
	})

	it('counts the rows its caller may read once they join a team', async () => {
		const { seen } = await list(await connect(), 'Post', {
			...ranked,
			first: 2,
			totalCount: true,
		})
		await Member.create({ data: { user: 'ada', team: { connect: two } } }, M)
		expect(await message(seen, 2)).toEqual({
			kind: 'changes',
			revision: 2,
			changes: [],
			totalCount: 5,
		})
	})

	it('follows a beforeFind that reads other rows by planning again', async () => {
		await Note.create({ data: { text: 'mine', team: 'One' } }, M)
		await Note.create({ data: { text: 'theirs', team: 'Two' } }, M)
		const { seen } = await list(await connect(), 'Note', {
			first: 5,
			select: { text: true },
		})
		expect(seen[0]).toMatchObject({ rows: [{ text: 'mine' }] })
		await Member.create({ data: { user: 'ada', team: { connect: two } } }, M)
		expect(await message(seen, 2)).toMatchObject({
			kind: 'reset',
			rows: [{ text: 'mine' }, { text: 'theirs' }],
		})
	})

	it('plans again when a row its beforeFind includes changes', async () => {
		await Note.create({ data: { text: 'mine', team: 'One' } }, M)
		const { seen } = await list(await connect(), 'Note', {
			first: 5,
			select: { text: true },
		})
		// Past the seed's changes, the rename alone reaches the included team.
		await new Promise((done) => setTimeout(done, 100))
		await Team.update({ where: one, data: { name: 'Uno' } }, M)
		expect(await message(seen, 2)).toMatchObject({ kind: 'reset', rows: [] })
	})

	it('closes when a planned read can no longer be planned', async () => {
		const { seen } = await list(await connect(), 'Note', { first: 5 })
		unplanned = true
		running.feed().missed()
		expect(await message(seen, 2)).toEqual({ kind: 'closed' })
		expect(errors).toContain(
			'A live read of Note cannot be planned: it closes.',
		)
	})
})

describe('a viewer', () => {
	beforeEach(async () => seeded())

	it('closes every live read when its session ends', async () => {
		const viewer = await connect()
		const { seen } = await list(viewer, 'Post', { ...ranked, first: 1 })
		const notes = await list(viewer, 'Note', { first: 1 })
		await Session.deleteMany({ where: { token: 'ada-token' } }, M)
		expect(await message(seen, 2)).toEqual({ kind: 'closed' })
		expect(await message(notes.seen, 2)).toEqual({ kind: 'closed' })
		await expect(list(viewer, 'Post', { first: 1 })).rejects.toThrow(
			'The viewer is closed.',
		)
	})

	it('keeps its live reads when its session is written but stays', async () => {
		const viewer = await connect()
		const { seen } = await list(viewer, 'Post', { ...ranked, first: 1 })
		await Session.updateMany(
			{ where: { token: 'ada-token' }, data: { user: 'ada' } },
			M,
		)
		await Post.update(
			{ where: { id: posts[0]?.id ?? '' }, data: { title: 'q1' } },
			M,
		)
		expect(await message(seen, 2)).toMatchObject({ kind: 'changes' })
	})

	it('stops following once it closes, and when the application stops', async () => {
		const viewer = await connect()
		const { seen } = await list(viewer, 'Post', { ...ranked, first: 1 })
		viewer.close()
		viewer.close()
		await Post.update(
			{ where: { id: posts[0]?.id ?? '' }, data: { title: 'q1' } },
			M,
		)
		const other = await list(await connect(), 'Post', { ...ranked, first: 1 })
		await Post.update(
			{ where: { id: posts[0]?.id ?? '' }, data: { title: 'r1' } },
			M,
		)
		await message(other.seen, 2)
		expect(seen).toHaveLength(1)
	})

	it('refuses what it cannot follow', async () => {
		const viewer = await connect()
		const refused = async (model: string, args: unknown) =>
			list(viewer, model, args)
		await expect(refused('Session', { first: 1 })).rejects.toThrow(
			'Session is not live.',
		)
		await expect(refused('Post', {})).rejects.toThrow(
			'first must be a positive integer.',
		)
		await expect(refused('Post', { first: 1.5 })).rejects.toThrow(
			'first must be a positive integer.',
		)
		await expect(
			refused('Post', { first: 1, totalCount: 'yes' }),
		).rejects.toThrow('totalCount must be a boolean.')
		await expect(refused('Post', { first: 1001 })).rejects.toThrow(
			'first is over 1000, the most a live list follows.',
		)
		await expect(refused('Comment', { first: 5 })).rejects.toThrow(
			'first is over 4, the most a live list follows.',
		)
		await expect(
			refused('Post', { first: 300, include: { comments: { take: 3 } } }),
		).rejects.toThrow('first is over 1000, the most a live list follows.')
		await expect(
			refused('Post', { first: 1, include: { comments: true } }),
		).rejects.toThrow('A live comments list needs a take.')
		await expect(
			refused('Post', { first: 1, include: { team: true } }),
		).rejects.toThrow('Team is not live.')
		await expect(
			refused('Post', {
				first: 1,
				select: { _count: { select: { comments: true } } },
			}),
		).resolves.toBeDefined()
		await expect(
			refused('Author', {
				first: 1,
				include: { posts: { take: 1, include: { team: true } } },
			}),
		).rejects.toThrow('Team is not live.')
		await expect(
			refused('Comment', { first: 1, orderBy: { post: { rank: 'asc' } } }),
		).rejects.toThrow("A live list sorts by Comment's own fields")
	})
})

describe('a live list with nested rows', () => {
	beforeEach(async () => seeded())

	it('sends a row again when a row it shows changes', async () => {
		const ada = await Author.create({ data: { name: 'Ada' } }, M)
		await Post.update(
			{
				where: { id: posts[0]?.id ?? '' },
				data: { author: { connect: { id: ada.id } } },
			},
			M,
		)
		const { seen } = await list(await connect(), 'Post', {
			...ranked,
			first: 2,
			select: {
				title: true,
				author: { select: { name: true } },
				comments: { take: 2, select: { text: true } },
				_count: { select: { comments: true } },
			},
		})
		expect(seen[0]).toMatchObject({
			rows: [
				{ title: 'p1', author: { id: ada.id, name: 'Ada' }, comments: [] },
				{ title: 'p2', author: null },
			],
		})
		await Author.update(
			{ where: { id: ada.id }, data: { name: 'Lovelace' } },
			M,
		)
		expect(await message(seen, 2)).toMatchObject({
			changes: [
				{
					upsert: { title: 'p1', author: { name: 'Lovelace' } },
					after: null,
				},
			],
		})
		const comment = await Comment.create(
			{
				data: { text: 'first', post: { connect: { id: posts[1]?.id ?? '' } } },
			},
			M,
		)
		expect(await message(seen, 3)).toMatchObject({
			changes: [
				{
					upsert: {
						title: 'p2',
						comments: [{ text: 'first' }],
						_count: { comments: 1 },
					},
					after: posts[0]?.id,
				},
			],
		})
		await Comment.delete({ where: { id: comment.id } }, M)
		expect(await message(seen, 4)).toMatchObject({
			changes: [
				{ upsert: { title: 'p1' } },
				{ upsert: { title: 'p2', comments: [] } },
			],
		})
	})

	it('keeps the ids it selects, and leaves out what it omits', async () => {
		const { seen } = await list(await connect(), 'Post', {
			...ranked,
			select: undefined,
			omit: { id: true, open: true },
			first: 1,
		})
		expect(seen[0]).toMatchObject({ rows: [{ id: posts[0]?.id, title: 'p1' }] })
		expect(seen[0]).not.toMatchObject({ rows: [{ open: true }] })
	})
})

/** The messages of a live row of posts, by `where`. */
const row = async (where: unknown): Promise<LiveMessage[]> => {
	const viewer = await connect()
	const seen: LiveMessage[] = []
	const args = { where, select: { title: true } }
	await viewer.row('Post', args, (sent) => seen.push(sent))
	return seen
}

describe('a live row', () => {
	beforeEach(async () => seeded())

	it('sends the row, again when it changes, and null once deleted', async () => {
		const id = posts[0]?.id ?? ''
		const seen = await row({ id })
		expect(seen).toEqual([
			{ kind: 'row', revision: 1, row: { id, title: 'p1' } },
		])
		await Post.update({ where: { id }, data: { title: 'q1' } }, M)
		expect(await message(seen, 2)).toEqual({
			kind: 'row',
			revision: 2,
			row: { id, title: 'q1' },
		})
		await Post.delete({ where: { id } }, M)
		expect(await message(seen, 3)).toEqual({
			kind: 'row',
			revision: 3,
			row: null,
		})
	})

	it('sends null for a row its caller cannot read', async () => {
		expect(await row({ id: posts[4]?.id ?? '' })).toEqual([
			{ kind: 'row', revision: 1, row: null },
		])
	})
})

describe('a failing live read', () => {
	beforeEach(async () => seeded())

	it('reads again, then closes when it fails again', async () => {
		const { seen } = await list(await connect(), 'Comment', { first: 2 })
		// The seed's changes rebuild the caller, which plans the read again.
		await new Promise((done) => setTimeout(done, 100))
		failing = true
		await Comment.create(
			{
				data: { text: 'first', post: { connect: { id: posts[0]?.id ?? '' } } },
			},
			M,
		)
		expect(await message(seen, 2)).toEqual({ kind: 'closed' })
		expect(errors).toEqual([
			'A live read of Comment failed: it reads again.',
			'A live read of Comment failed: it closes.',
		])
	})

	it('refuses a list whose first read fails', async () => {
		failing = true
		await expect(
			list(await connect(), 'Comment', { first: 2 }),
		).rejects.toThrow('Broken.')
	})
})

describe('the plugin', () => {
	it('builds each caller again on its timer, which ends a revoked session', async () => {
		await seeded({ refresh: 20 })
		const { seen } = await list(await connect(), 'Post', {
			...ranked,
			first: 1,
		})
		revoked = true
		expect(await message(seen, 2)).toEqual({ kind: 'closed' })
	})

	it('builds a caller again when it expires, which ends its session', async () => {
		await seeded()
		ends = Date.now() + 1100
		const viewer = await connect()
		const { seen } = await list(viewer, 'Post', { ...ranked, first: 1 })
		await vi.waitFor(() => expect(seen).toHaveLength(2), { timeout: 3000 })
		expect(seen[1]).toEqual({ kind: 'closed' })
		expect(Date.now()).toBeGreaterThanOrEqual(ends)
	})

	it('ignores the changes it hears once the application stopped', async () => {
		await seeded()
		const { seen } = await list(await connect(), 'Post', {
			...ranked,
			first: 1,
		})
		await Post.create(
			{ data: { title: 'p0', rank: 0, team: { connect: one } } },
			M,
		)
		await running.app.stop()
		await new Promise((done) => setTimeout(done, 100))
		expect(seen).toHaveLength(1)
	})

	it('refuses limits that are not positive integers', async () => {
		running = appOf({ maxLive: 0 })
		await expect(running.app.start()).rejects.toThrow(
			"realtime's maxLive must be a positive integer.",
		)
		running = appOf({ refresh: 1.5 })
		await expect(running.app.start()).rejects.toThrow(
			"realtime's refresh must be a positive integer.",
		)
		await seeded()
	})

	it('limits the live reads and the rows one connection follows', async () => {
		await seeded({ maxSubscriptions: 2, maxConnectionRows: 5 })
		const viewer = await connect()
		const first = await list(viewer, 'Post', { ...ranked, first: 2 })
		await expect(first.handle.grow(4)).rejects.toThrow(
			'A connection follows at most 5 rows.',
		)
		await first.handle.grow(1)
		await expect(list(viewer, 'Post', { ...ranked, first: 3 })).rejects.toThrow(
			'A connection follows at most 5 rows.',
		)
		await list(viewer, 'Post', { ...ranked, first: 2 })
		await expect(list(viewer, 'Post', { ...ranked, first: 1 })).rejects.toThrow(
			'A connection holds at most 2 live reads.',
		)
		first.handle.close()
		await expect(
			list(viewer, 'Post', { ...ranked, first: 3 }),
		).resolves.toBeDefined()
		await running.app.stop()
		running = appOf({ maxConnectionRows: 0 })
		await expect(running.app.start()).rejects.toThrow(
			"realtime's maxConnectionRows must be a positive integer.",
		)
		await seeded()
	})

	it('says which models are live, and who a viewer follows as', async () => {
		await seeded()
		expect(api?.live('Post')).toBe(true)
		expect(api?.live('Session')).toBe(false)
		const viewer = await connect()
		expect(viewer.caller).toMatchObject({ kind: 'user' })
		expect(viewer.closed).toBe(false)
		viewer.close()
		expect(viewer.closed).toBe(true)
	})

	it('sends a whole window again when asked', async () => {
		await seeded()
		const { seen, handle } = await list(await connect(), 'Post', {
			...ranked,
			first: 1,
		})
		await handle.resend()
		expect(seen).toEqual([
			expect.objectContaining({ kind: 'reset', revision: 1 }),
			expect.objectContaining({ kind: 'reset', revision: 2 }),
		])
	})

	it('reads a link as an update of both sides', async () => {
		await seeded()
		const { seen } = await list(await connect(), 'Post', {
			...ranked,
			first: 1,
		})
		const id = posts[0]?.id ?? ''
		running.feed().changed([
			{ kind: 'link', model: 'Post', field: 'comments', pairs: [[id, 'c']] },
			{ kind: 'unlink', model: 'Team', field: 'posts' },
		])
		expect(await message(seen, 2)).toMatchObject({ kind: 'reset' })
	})
})
