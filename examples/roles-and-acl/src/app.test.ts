// Uses roles and ACLs as clients would, over GraphQL, each test on a new
// in-memory database whose roles the server gives.
import { ACL } from '@ultimabase/acl'
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { app } from './app.ts'
import { Role } from './models.ts'
import { Note } from './notes.ts'

const running = testApplication(app)

/** A GraphQL request's response body. */
async function request(
	query: string,
	variables: object = {},
	token?: string,
): Promise<unknown> {
	const response = await fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
		},
		body: JSON.stringify({ query, variables }),
	})
	return response.json()
}

/** The value under `path` in a response body. */
const at = (value: unknown, ...path: string[]): unknown =>
	path.reduce<unknown>((inner, key) => Reflect.get(Object(inner), key), value)

const refused = (code: string) => ({ errors: [{ extensions: { code } }] })

async function signUp(name: string) {
	const body = await request(
		`mutation ($input: SignUpInput!) { signUp(input: $input) { token user { id } } }`,
		{
			input: { email: `${name}@example.com`, password: 'correct horse', name },
		},
	)
	const id = String(at(body, 'data', 'signUp', 'user', 'id'))
	return { id, token: String(at(body, 'data', 'signUp', 'token')) }
}

const members = (...users: { id: string }[]) => ({
	connect: users.map(({ id }) => ({ id })),
})

/** Ada writes, Grace is in the team, Bob is neither; roles given as Master. */
async function team() {
	const [ada, grace, bob] = [
		await signUp('ada'),
		await signUp('grace'),
		await signUp('bob'),
	]
	//#region give
	await Role.create(
		{ data: { name: 'writer', members: members(ada) } },
		{ as: master },
	)
	await Role.create(
		{ data: { name: 'team', members: members(ada, grace) } },
		{ as: master },
	)
	//#endregion
	return { ada, grace, bob }
}

const create = 'mutation { createNote(data: { title: "Plans" }) { id title } }'
const titles = async (token: string) =>
	at(
		await request('{ notes { edges { node { title } } } }', {}, token),
		'data',
		'notes',
		'edges',
	)
const plans = [{ node: { title: 'Plans' } }]

describe('roles', () => {
	it('lets only a writer create a note', async () => {
		const { ada, grace } = await team()
		//#region writer
		expect(await request(create, {}, grace.token)).toMatchObject(
			refused('ACCESS_DENIED'),
		)
		expect(await request(create, {}, ada.token)).toMatchObject({
			data: { createNote: { title: 'Plans' } },
		})
		//#endregion
	})

	it('gives the rights of the roles a role inherits', async () => {
		const { bob } = await team()
		//#region inherit
		// An editor is a writer too, and Bob is an editor.
		const writer = await Role.findUniqueOrThrow(
			{ where: { name: 'writer' } },
			{ as: master },
		)
		await Role.create(
			{
				data: {
					name: 'editor',
					members: members(bob),
					inherits: { connect: [{ id: writer.id }] },
				},
			},
			{ as: master },
		)
		expect(await request(create, {}, bob.token)).toMatchObject({
			data: { createNote: { title: 'Plans' } },
		})
		expect(await request('mutation { myRoles }', {}, bob.token)).toEqual({
			data: { myRoles: ['editor', 'writer'] },
		})
		//#endregion
	})
})

describe('a note’s ACL', () => {
	it('keeps a new note to its author', async () => {
		const { ada, grace } = await team()
		//#region author
		await request(create, {}, ada.token)
		expect(await titles(ada.token)).toEqual(plans)
		expect(await titles(grace.token)).toEqual([])
		//#endregion
	})

	it('lets a role read a note its writer shares, and no more', async () => {
		const { ada, grace, bob } = await team()
		const note = at(
			await request(create, {}, ada.token),
			'data',
			'createNote',
			'id',
		)
		//#region share
		const share = `mutation ($note: String!) { shareNote(note: $note, role: "team") { title } }`
		// Grace cannot read it yet, so it does not exist for her.
		expect(await request(share, { note }, grace.token)).toMatchObject(
			refused('NOT_FOUND'),
		)
		expect(await request(share, { note }, ada.token)).toEqual({
			data: { shareNote: { title: 'Plans' } },
		})
		expect(await titles(grace.token)).toEqual(plans)
		expect(await titles(bob.token)).toEqual([])
		// She reads it, but writes neither the note nor its rights.
		const rename = `mutation ($note: ID!) {
			updateNote(where: { id: $note }, data: { title: "Mine" }) { title }
		}`
		expect(await request(rename, { note }, grace.token)).toMatchObject(
			refused('NOT_FOUND'),
		)
		expect(await request(share, { note }, grace.token)).toMatchObject(
			refused('ACCESS_DENIED'),
		)
		//#endregion
	})

	it('is written by Master only, and read by clients', async () => {
		const { ada } = await team()
		//#region write
		// A client cannot give a note rights, even its own.
		const open = `mutation {
			createNote(data: { title: "Open", acl: { read: ["*"], write: [] } }) { id }
		}`
		expect(await request(open, {}, ada.token)).toMatchObject(
			refused('ACCESS_DENIED'),
		)
		// Master can, with an ACL or its JSON: `*` is the public.
		const note = await Note.create(
			{ data: { title: 'News', acl: { read: ['*'], write: [] } } },
			{ as: master },
		)
		expect(note.acl.publicCan('read')).toBe(true)
		const read = '{ notes { edges { node { title acl } } } }'
		expect(await request(read)).toEqual({
			data: {
				notes: {
					edges: [{ node: { title: 'News', acl: { read: ['*'], write: [] } } }],
				},
			},
		})
		//#endregion
	})
})

describe('the ACL class', () => {
	it('builds rights, each method returning a new ACL', () => {
		//#region class
		const ada = { id: 'u_1' }
		const staff = { id: 'r_1' }
		// Without permissions, a method gives or takes both.
		const rights = new ACL()
			.allowPublic('read')
			.allowUser(ada)
			.allowRole(staff, 'read')
		expect(rights.toJSON()).toEqual({
			read: ['*', 'role:r_1', 'user:u_1'],
			write: ['user:u_1'],
		})
		expect(rights.userCan(ada, 'write')).toBe(true)
		expect(rights.roleCan(staff, 'write')).toBe(false)
		expect(rights.users('read')).toEqual(['u_1'])
		expect(rights.roles('read')).toEqual(['r_1'])

		const closed = rights.denyPublic().denyUser(ada, 'write')
		expect(closed.publicCan('read')).toBe(false)
		expect(closed.entries()).toEqual(['read:role:r_1', 'read:user:u_1'])
		// The JSON back to an ACL; a subject is *, user:<id> or role:<id>.
		expect(ACL.fromJSON(closed.toJSON()).entries()).toEqual(closed.entries())
		expect(() => ACL.fromJSON({ read: ['team'] })).toThrow(
			'read[0]: a subject is *, user:<id> or role:<id>.',
		)
		//#endregion
	})
})
