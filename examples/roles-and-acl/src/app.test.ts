// Uses roles and ACLs as clients would, over GraphQL, each test on a new
// in-memory database whose roles the server gives. Its short regions and the
// request files beside it are shown on the pages (D-282).
import { ACL } from '@ultimabase/acl'
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { requestFiles } from '../../../scripts/requests.ts'
import { app } from './app.ts'
import { Role } from './models.ts'
import { Note } from './notes.ts'

const { send, file, check } = requestFiles(
	new URL('requests/', import.meta.url),
	testApplication(app),
)

const as = { as: master }

/** The value under `path` in a response body. */
const at = (value: unknown, ...path: string[]): unknown =>
	path.reduce<unknown>((inner, key) => Reflect.get(Object(inner), key), value)

/** What a request needs to be sent as a signed-in user. */
const bearer = ({ token }: { token: string }) => ({
	headers: { authorization: `Bearer ${token}` },
})

const refused = (code: string) => ({ errors: [{ extensions: { code } }] })

async function signUp(name: string) {
	const body = await send(
		`mutation ($input: SignUpInput!) { signUp(input: $input) { token user { id } } }`,
		{
			input: { email: `${name}@example.com`, password: 'correct horse', name },
		},
	)
	const id = String(at(body, 'data', 'signUp', 'user', 'id'))
	return { id, token: String(at(body, 'data', 'signUp', 'token')) }
}

/** Ada writes, Grace is in the team, Bob is neither; roles given as Master. */
async function team() {
	const [ada, grace, bob] = [
		await signUp('ada'),
		await signUp('grace'),
		await signUp('bob'),
	]
	//#region give-writer
	await Role.create(
		{ data: { name: 'writer', members: { connect: [{ id: ada.id }] } } },
		as,
	)
	//#endregion
	//#region give-team
	await Role.create(
		{
			data: {
				name: 'team',
				members: { connect: [{ id: ada.id }, { id: grace.id }] },
			},
		},
		as,
	)
	//#endregion
	return { ada, grace, bob }
}

describe('roles', () => {
	it('lets only a writer create a note', async () => {
		const { ada, grace } = await team()
		expect(await file('create-note', {}, bearer(grace))).toMatchObject(
			refused('ACCESS_DENIED'),
		)
		await check('create-note', {}, bearer(ada))
	})

	it('gives the rights of the roles a role inherits', async () => {
		const { bob } = await team()
		const writer = await Role.findUniqueOrThrow(
			{ where: { name: 'writer' } },
			as,
		)
		// An editor is a writer too, and Bob is an editor.
		//#region inherit
		await Role.create(
			{
				data: {
					name: 'editor',
					members: { connect: [{ id: bob.id }] },
					inherits: { connect: [{ id: writer.id }] },
				},
			},
			as,
		)
		//#endregion
		expect(await file('create-note', {}, bearer(bob))).toMatchObject({
			data: { createNote: { title: 'Plans' } },
		})
		await check('my-roles', {}, bearer(bob))
	})
})

describe('a note’s ACL', () => {
	it('keeps a new note to its author', async () => {
		const { ada, grace } = await team()
		await check('create-note', {}, bearer(ada))
		await check('notes', {}, bearer(ada))
		expect(await file('notes', {}, bearer(grace))).toEqual({
			data: { notes: { edges: [] } },
		})
	})

	it('lets a role read a note its writer shares, and no more', async () => {
		const { ada, grace, bob } = await team()
		const note = at(
			await file('create-note', {}, bearer(ada)),
			'data',
			'createNote',
			'id',
		)
		// Grace cannot read it yet, so it does not exist for her.
		expect(await file('share', { note }, bearer(grace))).toMatchObject(
			refused('NOT_FOUND'),
		)
		await check('share', { note }, bearer(ada))
		await check('notes', {}, bearer(grace))
		expect(await file('notes', {}, bearer(bob))).toEqual({
			data: { notes: { edges: [] } },
		})
		// She reads it, but writes neither the note nor its rights.
		await check('rename', { note }, bearer(grace))
		expect(await file('share', { note }, bearer(grace))).toMatchObject(
			refused('ACCESS_DENIED'),
		)
	})

	it('is written by Master only, and read by clients', async () => {
		const { ada } = await team()
		// A client cannot give a note rights, even its own.
		await check('open-note', {}, bearer(ada))
		// Master can, here with the JSON: `*` is the public.
		//#region master-acl
		const note = await Note.create(
			{ data: { title: 'News', acl: { read: ['*'], write: [] } } },
			as,
		)
		expect(note.acl.publicCan('read')).toBe(true)
		//#endregion
		await check('public-notes')
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
		//#endregion
		//#region ask
		expect(rights.userCan(ada, 'write')).toBe(true)
		expect(rights.roleCan(staff, 'write')).toBe(false)
		expect(rights.users('read')).toEqual(['u_1'])
		expect(rights.roles('read')).toEqual(['r_1'])
		//#endregion
		//#region deny
		const closed = rights.denyPublic().denyUser(ada, 'write')
		expect(closed.publicCan('read')).toBe(false)
		expect(closed.entries()).toEqual(['read:role:r_1', 'read:user:u_1'])
		//#endregion
		//#region from-json
		// The JSON back to an ACL; a subject is *, user:<id> or role:<id>.
		expect(ACL.fromJSON(closed.toJSON()).entries()).toEqual(closed.entries())
		expect(() => ACL.fromJSON({ read: ['team'] })).toThrow(
			'read[0]: a subject is *, user:<id> or role:<id>.',
		)
		//#endregion
	})
})
