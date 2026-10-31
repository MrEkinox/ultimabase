// Live functions (D-154): a query function listing realtime() is run again
// once a write may change what it read, after a quiet wait, and sends its
// whole result unless it equals the last; its caller's rights run it again,
// another user and an error close it.
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { Caller, Logger, PluginTypes } from 'ultimabase'
import {
	allow,
	defineApp,
	defineFunction,
	defineModel,
	definePlugin,
	defineType,
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

const Session = defineModel({
	name: 'Session',
	fields: (f) => ({ token: f.string({ unique: true }), user: f.string() }),
})
const Team = defineModel({
	name: 'Team',
	fields: (f) => ({ name: f.string(), posts: f.many(() => Post) }),
}).with({ access: { read: () => true } })
const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		rank: f.number({ integer: true }),
		open: f.boolean({ default: true }),
		views: f.number({ integer: true, default: 0 }),
		team: f.one(() => Team),
	}),
}).with({ access: { read: () => true } })

let runs = 0
let failing: Error | undefined
let started: (() => void) | undefined
let held: Promise<void> | undefined
/** The titles of the open posts, by rank. */
const titles = defineFunction({
	name: 'titles',
	query: true,
	use: [realtime()],
	output: z.array(z.string()),
	run: async ({ caller }) => {
		runs += 1
		started?.()
		await held
		if (failing !== undefined) throw failing
		const found = await Post.findMany(
			{
				where: { open: true },
				orderBy: { rank: 'asc' },
				select: { title: true },
			},
			{ as: caller },
		)
		return found.map(({ title }) => title)
	},
}).with({ access: allow.public, realtime: { debounce: 20 } })
/** Each team's name and how many posts it has. */
const teams = defineFunction({
	name: 'teams',
	query: true,
	use: [realtime()],
	output: z.array(z.string()),
	run: async ({ caller }) => {
		const found = await Team.findMany(
			{
				orderBy: { name: 'asc' },
				include: { posts: { select: { id: true } } },
			},
			{ as: caller },
		)
		return found.map(({ name, posts }) => `${name}:${posts.length}`)
	},
}).with({ access: allow.public, realtime: { debounce: 200 } })
/** The titles of the posts of the team named One. */
const ones = defineFunction({
	name: 'ones',
	query: true,
	use: [realtime()],
	output: z.array(z.string()),
	run: async ({ caller }) => {
		const found = await Post.findMany(
			{ where: { team: { is: { name: 'One' } } }, select: { title: true } },
			{ as: caller },
		)
		return found.map(({ title }) => title).toSorted()
	},
}).with({ access: allow.public })
const plain = defineFunction({
	name: 'plain',
	query: true,
	run: () => undefined,
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

interface Watching extends PluginTypes {
	readonly name: 'watching'
	readonly requires: Realtime
}
let api: RealtimeApi | undefined
/** Keeps the realtime API; a request's `authorization` names a session. */
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
	identify: async (request) => {
		const token = request.headers.get('authorization') ?? ''
		const session = await Session.findUnique({ where: { token } }, M)
		return session === null ? undefined : asUser({ id: session.user })
	},
})

const request = (token: string): Request =>
	new Request('http://localhost/', { headers: { authorization: token } })

let app: ReturnType<typeof defineApp> | undefined
let one: { readonly id: string }

async function seeded(options?: RealtimeOptions): Promise<void> {
	app = defineApp({
		database: memory(),
		models: [Session, Team, Post],
		functions: [titles, teams, ones, plain],
		plugins: [realtimePlugin(options), watching.plugin()],
		logger,
	})
	await app.start()
	await Session.create({ data: { token: 'ada', user: 'ada' } }, M)
	await Session.create({ data: { token: 'ada-two', user: 'ada' } }, M)
	await Session.create({ data: { token: 'bob', user: 'bob' } }, M)
	one = { id: (await Team.create({ data: { name: 'One' } }, M)).id }
	const two = { id: (await Team.create({ data: { name: 'Two' } }, M)).id }
	for (const [rank, team] of [one, one, two].entries()) {
		const data = {
			title: `p${rank + 1}`,
			rank: rank + 1,
			team: { connect: team },
		}
		await Post.create({ data }, M)
	}
	// The seeding's writes reach the engine before a test follows.
	await quiet()
}

const connect = async (token = 'ada'): Promise<Viewer> => {
	if (api === undefined) throw new Error('No realtime API.')
	return api.connect(request(token))
}

type Followed = { readonly seen: LiveMessage[]; readonly handle: LiveHandle }

/** Follows the function `name`, as its transports run it. */
async function value(
	viewer: Viewer,
	name: string,
	run: (caller: Caller) => Promise<unknown>,
): Promise<Followed> {
	const seen: LiveMessage[] = []
	const handle = await viewer.value(name, run, (message) => seen.push(message))
	return { seen, handle }
}

const followed = async (name = 'titles', viewer?: Viewer) => {
	const fn = { titles, teams, ones }[name] ?? titles
	return value(viewer ?? (await connect()), name, async (caller) =>
		fn.run({ as: caller }),
	)
}

/** The `count`th message, once it came. */
const message = async (
	seen: readonly LiveMessage[],
	count: number,
): Promise<LiveMessage | undefined> => {
	await vi.waitFor(() => expect(seen).toHaveLength(count))
	return seen[count - 1]
}

/** Waits past the engine's gather and the function's debounce. */
const quiet = async () => new Promise((done) => setTimeout(done, 200))

const update = async (title: string, data: object) =>
	Post.updateMany({ where: { title }, data }, M)

beforeEach(() => {
	runs = 0
	failing = undefined
	started = undefined
	held = undefined
	errors.length = 0
})
afterEach(async () => {
	await app?.stop()
	app = undefined
})

describe('a live function', () => {
	beforeEach(async () => seeded())

	it('sends its whole result, then again when a write changes what it read', async () => {
		const { seen } = await followed()
		expect(seen).toEqual([
			{ kind: 'value', revision: 1, value: ['p1', 'p2', 'p3'] },
		])
		await update('p2', { title: 'q2' })
		expect(await message(seen, 2)).toEqual({
			kind: 'value',
			revision: 2,
			value: ['p1', 'q2', 'p3'],
		})
		await update('p3', { open: false })
		expect(await message(seen, 3)).toMatchObject({ value: ['p1', 'q2'] })
		await update('p1', { rank: 9 })
		expect(await message(seen, 4)).toMatchObject({ value: ['q2', 'p1'] })
		await Post.create(
			{ data: { title: 'p0', rank: 0, team: { connect: one } } },
			M,
		)
		expect(await message(seen, 5)).toMatchObject({ value: ['p0', 'q2', 'p1'] })
	})

	it('is not run again for a field it neither returned nor chose rows by', async () => {
		const { seen } = await followed()
		await update('p1', { views: 3 })
		await quiet()
		expect(runs).toBe(1)
		expect(seen).toHaveLength(1)
	})

	it('sends nothing when its result is the same', async () => {
		const { seen } = await followed()
		await update('p1', { title: 'p1' })
		await vi.waitFor(() => expect(runs).toBe(2))
		await quiet()
		expect(seen).toHaveLength(1)
	})

	it('runs once for writes close together, and never twice at once', async () => {
		const { seen } = await followed()
		let release: (() => void) | undefined
		held = new Promise<void>((done) => {
			release = done
		})
		const running = new Promise<void>((done) => {
			started = done
		})
		await update('p1', { title: 'a1' })
		await update('p2', { title: 'a2' })
		await running
		// Woken while it runs: it runs once more after.
		await update('p3', { title: 'a3' })
		await quiet()
		expect(runs).toBe(2)
		held = undefined
		release?.()
		// The held run read the last write too; the one after finds the same.
		expect(await message(seen, 2)).toMatchObject({
			value: ['a1', 'a2', 'a3'],
		})
		await vi.waitFor(() => expect(runs).toBe(3))
		expect(seen).toHaveLength(2)
	})

	it('waits at most a second however often it is woken', async () => {
		const { seen } = await followed('teams')
		const start = Date.now()
		for (let rank = 10; Date.now() - start < 1300; rank += 1) {
			const data = { title: `n${rank}`, rank, team: { connect: one } }
			await Post.create({ data }, M)
			await new Promise((done) => setTimeout(done, 30))
		}
		// Its 200 ms debounce never saw quiet: the second cut it short.
		expect(seen.length).toBeGreaterThan(1)
	})

	it('follows the rows of a relation it read', async () => {
		const { seen } = await followed('teams')
		expect(seen).toEqual([
			{ kind: 'value', revision: 1, value: ['One:2', 'Two:1'] },
		])
		await Post.create(
			{ data: { title: 'p4', rank: 4, team: { connect: one } } },
			M,
		)
		expect(await message(seen, 2)).toMatchObject({ value: ['One:3', 'Two:1'] })
	})

	it('follows a filter through a relation', async () => {
		const { seen } = await followed('ones')
		expect(seen[0]).toMatchObject({ value: ['p1', 'p2'] })
		await Team.updateMany({ where: { name: 'Two' }, data: { name: 'One' } }, M)
		expect(await message(seen, 2)).toMatchObject({
			value: ['p1', 'p2', 'p3'],
		})
	})

	it('sends its result again when asked, and nothing once closed', async () => {
		const { seen, handle } = await followed()
		await handle.resend()
		expect(seen[1]).toEqual({
			kind: 'value',
			revision: 2,
			value: ['p1', 'p2', 'p3'],
		})
		await expect(handle.grow(1)).rejects.toThrow('titles is no live list.')
		handle.close()
		await handle.resend()
		await update('p1', { title: 'q1' })
		await quiet()
		expect(seen).toHaveLength(2)
		expect(runs).toBe(1)
	})

	it('closes with the error a run failed with', async () => {
		const { seen } = await followed()
		const broken = new Error('Broken.')
		failing = broken
		await update('p1', { title: 'q1' })
		expect(await message(seen, 2)).toEqual({ kind: 'closed', error: broken })
		failing = undefined
		await update('p1', { title: 'r1' })
		await quiet()
		expect(seen).toHaveLength(2)
	})

	it('is refused when its first run fails', async () => {
		failing = new Error('Broken.')
		await expect(followed()).rejects.toThrow('Broken.')
	})
})

describe('the rights of a live function', () => {
	beforeEach(async () => seeded())

	it('run it again when its caller is built again', async () => {
		const { seen } = await followed()
		await Session.updateMany(
			{ where: { token: 'ada' }, data: { user: 'ada' } },
			M,
		)
		await vi.waitFor(() => expect(runs).toBe(2))
		expect(seen).toHaveLength(1)
	})

	it('close it when its caller is another user, or none', async () => {
		const viewer = await connect()
		const { seen } = await followed('titles', viewer)
		expect(await viewer.adopt(request('ada-two'))).toBe(true)
		expect(await viewer.adopt(request('bob'))).toBe(false)
		expect(await message(seen, 2)).toEqual({ kind: 'closed' })
		const other = await followed()
		await Session.deleteMany({ where: { token: 'ada' } }, M)
		expect(await message(other.seen, 2)).toEqual({ kind: 'closed' })
	})
})

describe('the live functions', () => {
	it('count among a connection’s live reads', async () => {
		await seeded({ maxSubscriptions: 2 })
		const viewer = await connect()
		const first = await followed('titles', viewer)
		await followed('teams', viewer)
		await expect(followed('ones', viewer)).rejects.toThrow(
			'A connection holds at most 2 live reads.',
		)
		first.handle.close()
		await expect(followed('ones', viewer)).resolves.toBeDefined()
	})

	it('are the functions that list realtime()', async () => {
		await seeded()
		expect(api?.liveFunction('titles')).toBe(true)
		expect(api?.liveFunction('plain')).toBe(false)
		const viewer = await connect()
		const refused = async (name: string) =>
			value(viewer, name, async () => undefined)
		await expect(refused('plain')).rejects.toThrow('plain is not live.')
		await expect(refused('missing')).rejects.toThrow('missing is not live.')
	})

	it('refuse a mutation, a page, and a debounce that is not a positive integer', async () => {
		// @ts-expect-error: a mutation cannot list realtime().
		const mutation = defineFunction({
			name: 'touch',
			use: [realtime()],
			run: () => undefined,
		})
		const slow = defineFunction({
			name: 'slow',
			query: true,
			use: [realtime()],
			run: () => undefined,
		}).with({ realtime: { debounce: 0 } })
		const paged = defineFunction({
			name: 'paged',
			query: true,
			use: [realtime()],
			output: defineType({
				name: 'Feed',
				fields: { posts: Post.paginated() },
			}),
			run: () => ({ posts: Post.paginate({}, { as: master }) }),
		})
		for (const [fn, refusal] of [
			[mutation, 'touch is a mutation: it cannot be live.'],
			[paged, 'paged returns a page: it cannot be live.'],
			[slow, "realtime's debounce must be a positive integer."],
		] as const) {
			app = defineApp({
				database: memory(),
				models: [Session, Team, Post],
				functions: [fn],
				plugins: [realtimePlugin(), watching.plugin()],
				logger,
			})
			await expect(app.start()).rejects.toThrow(refusal)
		}
		app = undefined
	})
})
