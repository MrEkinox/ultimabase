// Only Master gives a role (D-213): a client links no member and no
// inherited role, from either side, whatever the models' rules allow.
import { asUser } from '@ultimabase/testing'
import type { Caller } from 'ultimabase'
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

// The models let a client write: only the role fields stop it.
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

let app: ReturnType<typeof defineApp>
let ids: { admin: string; team: string; eve: string }
beforeEach(async () => {
	app = defineApp({
		database: memory(),
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
	expect(await made).toMatchObject({
		code: 'ACCESS_DENIED',
		details: { model: 'Role', operation: 'create', field: 'members' },
	})
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

it("lets a client write a role's own fields, and Master give it", async () => {
	await Role.update({ where: { id: ids.team }, data: { name: 'Crew' } }, eve())
	await User.update(
		{
			where: { id: ids.eve },
			data: { roles: { connect: [{ id: ids.admin }] } },
		},
		M,
	)
	expect(await isAdmin()).toBe(true)
})
