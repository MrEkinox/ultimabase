// Random writes, rights included (D-154): after each one, every live list a
// client holds equals a fresh read as its caller, and a row it removes is
// `gone` exactly when its caller can no longer read it.
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Caller, Logger, PluginTypes, Row } from 'ultimabase'
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
const users = ['ada', 'bob', 'cy'] as const
const idOf = (caller: Caller): string =>
	caller.kind === 'user' ? caller.user.id : ''

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
/** Rights through a relation: a user reads the posts of their teams. */
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
/** Rights on its own field: a user reads their items and the shared ones. */
const Item = defineModel({
	name: 'Item',
	fields: (f) => ({
		title: f.string(),
		rank: f.number({ integer: true }),
		owner: f.string(),
	}),
	use: [realtime()],
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where({ owner: { in: [idOf(caller), 'all'] } }),
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

let app: ReturnType<typeof defineApp>
beforeEach(async () => {
	errors.length = 0
	app = defineApp({
		database: memory(),
		models: [Team, Member, Post, Item],
		plugins: [realtimePlugin(), following.plugin()],
		logger,
	})
	await app.start()
})
afterEach(async () => app.stop())

/** A seeded generator, so that a failing run can be replayed. */
function random(seed: number): (below: number) => number {
	let state = seed
	return (below) => {
		state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
		return Math.floor((state / 2_147_483_648) * below)
	}
}

type Args = {
	readonly where?: object
	readonly orderBy: readonly object[]
	readonly first: number
	readonly totalCount?: boolean
}
const shown = { select: { id: true, title: true, rank: true } }
const lists: readonly (readonly ['Post' | 'Item', Args])[] = [
	['Item', { orderBy: [{ rank: 'asc' }], first: 3, totalCount: true }],
	[
		'Item',
		{ where: { rank: { gte: 4 } }, orderBy: [{ title: 'desc' }], first: 2 },
	],
	['Post', { orderBy: [{ rank: 'asc' }], first: 3, totalCount: true }],
	[
		'Post',
		{ where: { rank: { lte: 4 } }, orderBy: [{ title: 'desc' }], first: 2 },
	],
]

/** A client's copy of a live list, which each message changes. */
class Copy {
	rows: Row[] = []
	hasMore = false
	totalCount: number | undefined
	revision = 0
	/** The removals since the last check. */
	removed: { readonly id: string; readonly gone: boolean }[] = []

	take(message: LiveMessage): void {
		if (message.kind === 'closed') throw new Error('Closed.')
		if (message.revision !== this.revision + 1) {
			throw new Error(`Revision ${message.revision} after ${this.revision}.`)
		}
		this.revision = message.revision
		if (message.kind === 'reset') {
			this.rows = [...message.rows]
			this.hasMore = message.hasMore
			this.totalCount = message.totalCount
			return
		}
		if (message.kind !== 'changes') throw new Error(`A ${message.kind}.`)
		for (const change of message.changes) {
			if ('remove' in change) {
				this.rows = this.rows.filter(({ id }) => id !== change.remove)
				this.removed.push({ id: change.remove, gone: change.gone })
				continue
			}
			const rows = this.rows.filter(({ id }) => id !== change.upsert.id)
			const after = rows.findIndex(({ id }) => id === change.after)
			rows.splice(after + 1, 0, change.upsert)
			this.rows = rows
		}
		this.hasMore = message.hasMore ?? this.hasMore
		this.totalCount = message.totalCount ?? this.totalCount
	}
}

type Followed = {
	readonly model: 'Post' | 'Item'
	readonly args: Args
	readonly user: string
	readonly copy: Copy
}

/** What a fresh read as `user` gives the list `args` follows. */
async function fresh(model: 'Post' | 'Item', args: Args, user: string) {
	const as = { as: asUser({ id: user }) }
	const where = args.where ?? {}
	const orderBy = [...args.orderBy, { id: 'asc' }]
	const read = { ...shown, where, orderBy, take: args.first + 1 }
	const found =
		model === 'Post'
			? await Post.findMany(read, as)
			: await Item.findMany(read, as)
	const counted = async (): Promise<number> =>
		model === 'Post' ? Post.count({ where }, as) : Item.count({ where }, as)
	return {
		rows: found.slice(0, args.first),
		hasMore: found.length > args.first,
		totalCount: args.totalCount ? await counted() : undefined,
	}
}

/** Whether `user` reads the row `id`. */
async function readable(model: 'Post' | 'Item', id: string, user: string) {
	const args = { where: { id } }
	const as = { as: asUser({ id: user }) }
	const found =
		model === 'Post'
			? await Post.findUnique(args, as)
			: await Item.findUnique(args, as)
	return found !== null
}

const owners = [...users, 'all']
const titleOf = (pick: (below: number) => number): string =>
	'aeimquy'.charAt(pick(7)) + String(pick(10))

/** One random write: a row created, changed or deleted, or a member moved. */
async function write(pick: (below: number) => number): Promise<void> {
	const teams = await Team.findMany({}, M)
	const team = { id: teams[pick(teams.length)]?.id ?? '' }
	const title = titleOf(pick)
	const rank = pick(8)
	const owner = owners[pick(4)] ?? 'all'
	const posts = await Post.findMany({}, M)
	const items = await Item.findMany({}, M)
	const post = { id: posts[pick(posts.length)]?.id ?? '' }
	const item = { id: items[pick(items.length)]?.id ?? '' }
	switch (pick(9)) {
		case 0:
			await Post.create({ data: { title, rank, team: { connect: team } } }, M)
			return
		case 1:
			if (post.id === '') return
			await Post.update(
				{
					where: post,
					data:
						[{ title }, { rank }, { team: { connect: team } }][pick(3)] ?? {},
				},
				M,
			)
			return
		case 2:
			if (post.id !== '') await Post.delete({ where: post }, M)
			return
		case 3:
		case 4:
			await Item.create({ data: { title, rank, owner } }, M)
			return
		case 5:
			if (item.id === '') return
			await Item.update(
				{ where: item, data: [{ title }, { rank }, { owner }][pick(3)] ?? {} },
				M,
			)
			return
		case 6:
			if (item.id !== '') await Item.delete({ where: item }, M)
			return
		case 7: {
			const user = users[pick(3)] ?? 'ada'
			await Member.create({ data: { user, team: { connect: team } } }, M)
			return
		}
		default: {
			const members = await Member.findMany({}, M)
			const member = members[pick(members.length)]
			if (member !== undefined)
				await Member.delete({ where: { id: member.id } }, M)
		}
	}
}

it.each([1, 2, 3])(
	'keeps every list equal to a fresh read through random writes, seed %i',
	async (seed) => {
		const pick = random(seed)
		const teams = []
		for (const name of ['One', 'Two']) {
			teams.push(await Team.create({ data: { name } }, M))
		}
		// Rows past each window, which a row leaving it brings in.
		for (let index = 0; index < 16; index += 1) {
			const team = { id: teams[index % 2]?.id ?? '' }
			const [title, rank] = [titleOf(pick), pick(8)]
			await Post.create({ data: { title, rank, team: { connect: team } } }, M)
			const owner = owners[index % 4] ?? 'all'
			await Item.create({ data: { title, rank, owner } }, M)
		}
		for (const [user, team] of [
			['ada', teams[0]],
			['bob', teams[1]],
		] as const) {
			await Member.create(
				{ data: { user, team: { connect: { id: team?.id ?? '' } } } },
				M,
			)
		}
		if (api === undefined) throw new Error('No realtime API.')
		const realtimeApi = api
		const followed: Followed[] = []
		for (const user of users) {
			const viewer = await realtimeApi.connect(
				new Request('http://localhost/', { headers: { authorization: user } }),
			)
			for (const [model, args] of lists) {
				const copy = new Copy()
				await viewer.list(model, { ...shown, ...args }, (message) => {
					copy.take(message)
				})
				followed.push({ model, args, user, copy })
			}
		}
		// Each step's writes reach the lists in one flush, or a few.
		for (let step = 0; step < 20; step += 1) {
			const writes = 1 + pick(3)
			for (let index = 0; index < writes; index += 1) await write(pick)
			const expected = await Promise.all(
				followed.map(async ({ model, args, user }) => fresh(model, args, user)),
			)
			await vi.waitFor(
				() => {
					const copies = followed.map(({ copy }) => ({
						rows: copy.rows,
						hasMore: copy.hasMore,
						totalCount: copy.totalCount,
					}))
					expect(copies).toEqual(expected)
				},
				{ timeout: 2000, interval: 1 },
			)
			for (const { model, user, copy } of followed) {
				for (const { id, gone } of copy.removed) {
					expect(gone).toBe(!(await readable(model, id, user)))
				}
				copy.removed = []
			}
		}
		expect(errors).toEqual([])
	},
)
