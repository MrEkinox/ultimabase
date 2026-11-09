// Only Master gives a role (D-213) and writes one (D-355): a client links no
// member and no inherited role, from either side, and creates, renames or
// deletes no role, whatever the models' rules allow.
import { asUser } from '@ultimabase/testing'
import type { Caller, Logger } from 'ultimabase'
import {
	allow,
	defineApp,
	defineModel,
	master,
	memory,
	PublicError,
} from 'ultimabase'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { defineRole, hasRole, rolesPlugin } from './index.ts'

const M = { as: master }

// The models let a client write: only the roles plugin stops it.
const Role = defineRole({
	name: 'Role',
	members: () => User,
}).with({
	access: allow.public,
})
// A user edits their own row, as a profile.
const User = defineModel({
	name: 'User',
	fields: (f) => ({
		email: f.string(),
		roles: f.many(() => Role, { inverse: 'members' }),
	}),
}).with({
	access: {
		read: allow.public,
		update: ({ caller, record }) =>
			caller.kind === 'user' && record.id === caller.user.id,
	},
})
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
	},
})

// The refusals logged: the bindings and the message of each warning.
const warnings: unknown[] = []
const logger: Logger = {
	info: () => undefined,
	warn: (...said) => {
		warnings.push(said)
	},
	error: () => undefined,
	child: () => logger,
}

let app: ReturnType<typeof defineApp>
let ids: { admin: string; team: string; eve: string }
beforeEach(async () => {
	app = defineApp({
		database: memory(),
		logger,
		plugins: [rolesPlugin()],
		models: [Role, User, Post],
	})
	await app.start()
	const admin = await Role.create({ data: { name: 'Admin' } }, M)
	const team = await Role.create({ data: { name: 'Team' } }, M)
	const eve = await User.create(
		{ data: { email: 'eve@x', roles: { connect: [{ id: team.id }] } } },
		M,
	)
	ids = { admin: admin.id, team: team.id, eve: eve.id }
	warnings.length = 0
})
afterEach(async () => app.stop())

const eve = () => ({ as: asUser({ id: ids.eve }) })

async function isAdmin(): Promise<boolean> {
	seen.length = 0
	await Post.findMany({}, eve())
	const [caller] = seen
	if (caller === undefined) throw new Error('No caller was read.')
	return hasRole(caller, 'Admin')
}

async function refusal(run: () => Promise<unknown>): Promise<unknown> {
	try {
		await run()
	} catch (error) {
		if (error instanceof PublicError)
			return { code: error.code, details: error.details }
		throw error
	}
	return undefined
}

it("refuses a user who joins a role through their own row's roles", async () => {
	const error = await refusal(async () =>
		User.update(
			{
				where: { id: ids.eve },
				data: { roles: { connect: [{ id: ids.admin }] } },
			},
			eve(),
		),
	)
	expect(error).toMatchObject({
		code: 'ACCESS_DENIED',
		details: { model: 'Role', field: 'members', via: 'User.roles' },
	})
	expect(await isAdmin()).toBe(false)
})

it('refuses a user who leaves a role or creates one to join', async () => {
	const left = refusal(async () =>
		User.update(
			{ where: { id: ids.eve }, data: { roles: { set: [] } } },
			eve(),
		),
	)
	expect(await left).toMatchObject({ code: 'ACCESS_DENIED' })
	const made = refusal(async () =>
		User.update(
			{
				where: { id: ids.eve },
				data: { roles: { create: [{ name: 'Root' }] } },
			},
			eve(),
		),
	)
	// The role's own create is refused before its members' rule (D-355).
	expect(await made).toMatchObject({
		code: 'ACCESS_DENIED',
		details: { model: 'Role', operation: 'create' },
	})
	expect(await Role.count({ where: { name: 'Root' } }, M)).toBe(0)
})

it("refuses a client who writes a role's members or inheritance", async () => {
	const join = refusal(async () =>
		Role.update(
			{
				where: { id: ids.admin },
				data: { members: { connect: [{ id: ids.eve }] } },
			},
			eve(),
		),
	)
	expect(await join).toMatchObject({
		code: 'ACCESS_DENIED',
		details: { model: 'Role', field: 'members' },
	})
	const inherit = refusal(async () =>
		Role.update(
			{
				where: { id: ids.team },
				data: { inherits: { connect: [{ id: ids.admin }] } },
			},
			eve(),
		),
	)
	expect(await inherit).toMatchObject({
		code: 'ACCESS_DENIED',
		details: { model: 'Role', field: 'inherits' },
	})
	const inherited = refusal(async () =>
		Role.update(
			{
				where: { id: ids.admin },
				data: { inheritedBy: { connect: [{ id: ids.team }] } },
			},
			eve(),
		),
	)
	expect(await inherited).toMatchObject({ code: 'ACCESS_DENIED' })
	expect(await isAdmin()).toBe(false)
})

it('refuses a client who renames a role into one it lacks', async () => {
	// Before D-355: Admin renamed away, then Team renamed Admin.
	const renamed = refusal(async () =>
		Role.update({ where: { id: ids.team }, data: { name: 'Admin' } }, eve()),
	)
	expect(await renamed).toStrictEqual({
		code: 'ACCESS_DENIED',
		details: { model: 'Role', operation: 'update' },
	})
	// Logged as an access rule's refusal is, with the caller (D-88).
	expect(warnings).toStrictEqual([
		[
			{ model: 'Role', operation: 'update', callerId: ids.eve },
			'Role update refused.',
		],
	])
	const many = refusal(async () =>
		Role.updateMany({ where: {}, data: { name: 'Old' } }, eve()),
	)
	expect(await many).toMatchObject({ code: 'ACCESS_DENIED' })
	const names = await Role.findMany({ select: { name: true } }, M)
	expect(names.map(({ name }) => name).toSorted()).toStrictEqual([
		'Admin',
		'Team',
	])
	expect(await isAdmin()).toBe(false)
})

it('refuses a client who creates or deletes a role', async () => {
	const made = refusal(async () =>
		Role.create({ data: { name: 'Root' } }, eve()),
	)
	expect(await made).toStrictEqual({
		code: 'ACCESS_DENIED',
		details: { model: 'Role', operation: 'create' },
	})
	const gone = refusal(async () =>
		Role.delete({ where: { id: ids.admin } }, eve()),
	)
	expect(await gone).toStrictEqual({
		code: 'ACCESS_DENIED',
		details: { model: 'Role', operation: 'delete' },
	})
	const anonymous = refusal(async () =>
		Role.deleteMany({ where: {} }, { as: { kind: 'anonymous' } }),
	)
	expect(await anonymous).toMatchObject({ code: 'ACCESS_DENIED' })
	expect(warnings.at(-1)).toStrictEqual([
		{ model: 'Role', operation: 'delete', callerId: null },
		'Role delete refused.',
	])
	expect(await Role.count({}, M)).toBe(2)
})

it('lets Master write a role and give it', async () => {
	await Role.update({ where: { id: ids.team }, data: { name: 'Crew' } }, M)
	await User.update(
		{
			where: { id: ids.eve },
			data: { roles: { connect: [{ id: ids.admin }] } },
		},
		M,
	)
	expect(await isAdmin()).toBe(true)
	await Role.delete({ where: { id: ids.team } }, M)
	expect(await Role.count({}, M)).toBe(1)
	expect(warnings).toStrictEqual([])
})
