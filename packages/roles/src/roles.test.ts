// Roles (D-123, D-126): a role model, roles inside roles, and `hasRole`,
// asked in a rule or with the caller.
import { asUser } from '@ultimabase/testing'
import type { Caller } from 'ultimabase'
import {
	allow,
	anyOf,
	defineApp,
	defineModel,
	master,
	memory,
} from 'ultimabase'
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import { defineRole, hasRole, rolesOf, rolesPlugin } from './index.ts'

const M = { as: master }

const Role = defineRole({
	name: 'Role',
	members: () => User,
	fields: (f) => ({ color: f.string({ optional: true }) }),
})
const User = defineModel({
	name: 'User',
	fields: (f) => ({ email: f.string(), roles: f.many(() => Role) }),
})

/** Each caller a read rule received. */
const seen: Caller[] = []
const Post = defineModel({
	name: 'Post',
	fields: (f) => ({ title: f.string() }),
}).with({
	access: {
		read: ({ caller }) => {
			seen.push(caller)
			return true
		},
		create: hasRole('Editor'),
		delete: anyOf(hasRole('Moderator'), allow.private),
	},
})

const started = () =>
	defineApp({
		database: memory(),
		plugins: [rolesPlugin()],
		models: [Role, User, Post],
	})

/** A new role, inheriting `inherits`. */
const role = async (name: string, inherits: readonly { id: string }[] = []) =>
	Role.create(
		{
			data: { name, inherits: { connect: inherits.map(({ id }) => ({ id })) } },
		},
		M,
	)

const member = async (email: string, roles: readonly { id: string }[]) =>
	User.create(
		{ data: { email, roles: { connect: roles.map(({ id }) => ({ id })) } } },
		M,
	)

/** The caller the plugin completes for `user`. */
async function callerOf(user: { readonly id: string }): Promise<Caller> {
	seen.length = 0
	await Post.findMany({}, { as: asUser(user) })
	const [caller] = seen
	if (caller === undefined) throw new Error('No caller was read.')
	return caller
}

const names = (caller: Caller) =>
	rolesOf(caller)
		.map(({ name }) => name)
		.toSorted()

describe('a role model', () => {
	let app: ReturnType<typeof started>
	beforeEach(async () => {
		app = started()
		await app.start()
	})
	afterEach(async () => app.stop())

	it('has a unique name, members, and the roles it inherits', async () => {
		const editor = await role('Editor')
		const admin = await role('Admin', [editor])
		expectTypeOf(admin.name).toEqualTypeOf<string>()
		expectTypeOf(admin.color).toEqualTypeOf<string | null>()
		const ada = await member('ada@example.com', [admin])
		const read = await Role.findUnique(
			{
				where: { id: admin.id },
				include: { members: true, inherits: true, inheritedBy: true },
			},
			M,
		)
		expect(read?.members.map(({ email }) => email)).toEqual([ada.email])
		expect(read?.inherits.map(({ name }) => name)).toEqual(['Editor'])
		expect(read?.inheritedBy).toEqual([])
		const inherited = await Role.findUnique(
			{ where: { id: editor.id }, include: { inheritedBy: true } },
			M,
		)
		expectTypeOf(inherited?.inheritedBy[0]?.name).toEqualTypeOf<
			string | undefined
		>()
		expect(inherited?.inheritedBy.map(({ name }) => name)).toEqual(['Admin'])
		await expect(role('Admin')).rejects.toMatchObject({
			code: 'UNIQUE_VIOLATION',
		})
	})

	it('gives each user caller its roles, inherited through every level', async () => {
		const editor = await role('Editor')
		const moderator = await role('Moderator', [editor])
		const admin = await role('Admin', [moderator])
		await role('Guest')
		const ada = await member('ada@example.com', [admin])
		const caller = await callerOf(ada)
		expect(names(caller)).toEqual(['Admin', 'Editor', 'Moderator'])
		expect(rolesOf(caller)).toContainEqual({ id: editor.id, name: 'Editor' })
		expect(Object.keys(caller)).toEqual(['kind', 'user'])
		expect(hasRole(caller, 'Editor')).toBe(true)
		expect(hasRole(caller, 'Guest', 'Moderator')).toBe(true)
		expect(hasRole(caller, 'Guest')).toBe(false)
		const bob = await member('bob@example.com', [])
		expect(rolesOf(await callerOf(bob))).toEqual([])
	})

	it('stops at a cycle', async () => {
		const first = await role('First')
		const second = await role('Second', [first])
		await Role.update(
			{
				where: { id: first.id },
				data: { inherits: { connect: [{ id: second.id }] } },
			},
			M,
		)
		const ada = await member('ada@example.com', [first])
		expect(names(await callerOf(ada))).toEqual(['First', 'Second'])
	})

	it('decides the rules that ask a role', async () => {
		const editor = await role('Editor')
		const moderator = await role('Moderator', [editor])
		const ada = await member('ada@example.com', [editor])
		const bob = await member('bob@example.com', [moderator])
		const eve = await member('eve@example.com', [])
		const post = await Post.create(
			{ data: { title: 'a' } },
			{ as: asUser(ada) },
		)
		await expect(
			Post.create({ data: { title: 'b' } }, { as: asUser(eve) }),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
		await expect(
			Post.delete({ where: { id: post.id } }, { as: asUser(ada) }),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
		await Post.delete({ where: { id: post.id } }, { as: asUser(bob) })
		await expect(
			Post.create({ data: { title: 'c' } }, { as: { kind: 'anonymous' } }),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
	})
})

describe('hasRole', () => {
	it('is false for an anonymous or Master caller', () => {
		expect(hasRole({ kind: 'anonymous' }, 'Admin')).toBe(false)
		expect(hasRole(master, 'Admin')).toBe(false)
		expect(hasRole('Admin')({ caller: master })).toBe(false)
	})

	it('stops on a user caller the roles plugin did not complete', () => {
		const ada = asUser({ id: 'ada' })
		expect(() => hasRole(ada, 'Admin')).toThrow(
			'hasRole reads the roles rolesPlugin() gives a caller: add rolesPlugin() to plugins.',
		)
		expect(() => hasRole('Admin')({ caller: ada })).toThrow('rolesPlugin()')
		expect(rolesOf(ada)).toEqual([])
	})

	it('takes a role name', () => {
		// @ts-expect-error: a role name is required.
		expect(() => hasRole(master)).toThrow('hasRole takes a role name.')
	})
})

describe('the roles plugin', () => {
	it('needs one role model', async () => {
		const none = defineApp({
			database: memory(),
			plugins: [rolesPlugin()],
			models: [Post],
		})
		await expect(none.start()).rejects.toThrow(
			'rolesPlugin() needs a role model: declare it with defineRole.',
		)
		const Other = defineRole({ name: 'Other', members: () => Member })
		const Member = defineModel({
			name: 'Member',
			fields: (f) => ({ roles: f.many(() => Other) }),
		})
		const two = defineApp({
			database: memory(),
			plugins: [rolesPlugin()],
			models: [Role, User, Other, Member],
		})
		await expect(two.start()).rejects.toThrow(
			'models lists two models defineRole returned: an application has one role model.',
		)
	})

	it('is in plugins when a role model is (D-32)', async () => {
		// @ts-expect-error: Role uses the roles plugin.
		const app = defineApp({ database: memory(), models: [Role, User] })
		await expect(app.start()).rejects.toThrow('roles')
	})
})

describe('defineRole', () => {
	it('refuses what is not a role model', () => {
		expect(() =>
			// @ts-expect-error: members is the user model's thunk.
			defineRole({ name: 'Bad', members: User }),
		).toThrow('defineRole(Bad): members is () => the user model.')
		expect(() =>
			defineRole({
				name: 'Bad',
				members: () => User,
				fields: (f) => ({ inherits: f.string() }),
			}),
		).toThrow('defineRole(Bad): inherits is a field defineRole adds.')
		expect(() =>
			defineRole({
				name: 'Bad',
				members: () => User,
				// @ts-expect-error: fields returns the fields.
				fields: () => 'color',
			}),
		).toThrow('defineRole(Bad): fields returns an object.')
	})

	it('keeps its dbName and indexes', async () => {
		const Team = defineRole({
			name: 'Team',
			dbName: 'teams',
			members: () => Player,
			fields: (f) => ({ rank: f.number() }),
			indexes: [{ fields: ['rank'] }],
		})
		const Player = defineModel({
			name: 'Player',
			fields: (f) => ({ teams: f.many(() => Team) }),
		})
		const app = defineApp({
			database: memory(),
			plugins: [rolesPlugin()],
			models: [Team, Player],
		})
		await app.start()
		try {
			const team = await Team.create({ data: { name: 'Red', rank: 1 } }, M)
			expect(team.rank).toBe(1)
		} finally {
			await app.stop()
		}
	})
})
