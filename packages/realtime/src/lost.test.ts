// A right lost (D-196): a member row deleted or a role left costs the reads
// of the one caller who loses rows, not those of every caller who reads
// through the same level.
import { defineRole, hasRole, rolesPlugin } from '@ultimabase/roles'
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Adapter, Caller, PluginTypes } from 'ultimabase'
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

const Role = defineRole({ name: 'Role', members: () => User })
const User = defineModel({
	name: 'User',
	fields: (f) => ({
		name: f.string(),
		roles: f.many(() => Role, { inverse: 'members' }),
		memberships: f.many(() => Member, { inverse: 'user' }),
	}),
})
const Team = defineModel({
	name: 'Team',
	fields: (f) => ({
		members: f.many(() => Member, { inverse: 'team' }),
		docs: f.many(() => Doc, { inverse: 'team' }),
	}),
})
const Member = defineModel({
	name: 'Member',
	fields: (f) => ({ user: f.one(() => User), team: f.one(() => Team) }),
})
/** A user reads the documents of the teams they are a member of. */
const Doc = defineModel({
	name: 'Doc',
	use: [realtime()],
	fields: (f) => ({ title: f.string(), team: f.one(() => Team) }),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where({
				team: {
					is: { members: { some: { user: { is: { id: idOf(caller) } } } } },
				},
			}),
	},
})
/** A reader reads every sheet. */
const Sheet = defineModel({
	name: 'Sheet',
	use: [realtime()],
	fields: (f) => ({ title: f.string() }),
}).with({
	access: {
		read: ({ caller }) => caller.kind === 'master' || hasRole(caller, 'Reader'),
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
let users: { readonly id: string }[] = []
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
		models: [Role, User, Team, Member, Doc, Sheet],
		plugins: [rolesPlugin(), realtimePlugin(), following.plugin()],
	})
	await app.start()
	const data = ['ada', 'bob', 'cy'].map((name) => ({ name }))
	users = await User.createManyAndReturn({ data }, M)
})
afterEach(async () => app.stop())

/** The messages of `model`'s live list as each of `users`, the first in. */
async function lists(model: string): Promise<LiveMessage[][]> {
	return Promise.all(
		users.map(async ({ id }) => {
			if (api === undefined) throw new Error('No realtime API.')
			const viewer = await api.connect(
				new Request('http://localhost/', { headers: { authorization: id } }),
			)
			const seen: LiveMessage[] = []
			const args = {
				first: 10,
				select: { title: true },
				orderBy: { title: 'asc' },
			}
			await viewer.list(model, args, (message) => seen.push(message))
			await vi.waitFor(() => expect(seen).toHaveLength(1))
			return seen
		}),
	)
}

/** Once the reads the writes so far started are over, past the gather. */
async function quiet(): Promise<void> {
	for (let known = -1; known !== finds.length;) {
		known = finds.length
		await new Promise((done) => setTimeout(done, 150))
	}
}

/** The reads of `model` once `write` was followed, as its loser hears it. */
async function readsOf(
	model: string,
	loser: readonly LiveMessage[],
	write: () => Promise<unknown>,
): Promise<number> {
	await quiet()
	finds = []
	await write()
	await vi.waitFor(() => expect(loser).toHaveLength(2))
	await quiet()
	return finds.filter((name) => name === model).length
}

it('re-checks the list of the member a deleted row named, alone', async () => {
	const team = await Team.create({ data: {} }, M)
	const of = (user: { id: string }) => ({
		user: { connect: { id: user.id } },
		team: { connect: { id: team.id } },
	})
	const members: { readonly id: string }[] = []
	for (const user of users) {
		members.push(await Member.create({ data: of(user) }, M))
	}
	const docs: string[] = []
	for (const title of ['a', 'b']) {
		const data = { title, team: { connect: { id: team.id } } }
		docs.push((await Doc.create({ data }, M)).id)
	}
	const [ada, bob, cy] = await lists('Doc')
	expect(bob?.[0]).toMatchObject({ rows: [{ title: 'a' }, { title: 'b' }] })
	const reads = await readsOf('Doc', bob ?? [], async () =>
		Member.delete({ where: { id: members[1]?.id ?? '' } }, M),
	)
	expect(bob?.[1]).toMatchObject({
		changes: docs.map((id) => ({ remove: id })),
	})
	expect([ada?.length, cy?.length]).toEqual([1, 1])
	// Bob's rows loaded, and the team's members, read once, refuse them all:
	// no query asks whether they stay in his list or whether he reads them.
	expect(reads).toBe(1)
})

it('builds again the caller who left a role, alone', async () => {
	const reader = await Role.create({ data: { name: 'Reader' } }, M)
	const connect = users.map(({ id }) => ({ id }))
	await Role.update(
		{ where: { id: reader.id }, data: { members: { connect } } },
		M,
	)
	await Sheet.create({ data: { title: 's' } }, M)
	const [ada, bob, cy] = await lists('Sheet')
	expect(bob?.[0]).toMatchObject({ rows: [{ title: 's' }] })
	const left = { roles: { disconnect: [{ id: reader.id }] } }
	const reads = await readsOf('Role', bob ?? [], async () =>
		User.update({ where: { id: users[1]?.id ?? '' }, data: left }, M),
	)
	expect(bob?.[1]).toMatchObject({ kind: 'reset', rows: [] })
	expect([ada?.length, cy?.length]).toEqual([1, 1])
	// Bob's roles read again; no one else's.
	expect(reads).toBe(1)
})
