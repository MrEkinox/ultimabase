// Uses roles and ACLs as clients would, over GraphQL, each test on a new
// in-memory database whose roles the server gives.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { app } from './app.ts'
import { Role } from './models.ts'

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
	await Role.create(
		{ data: { name: 'writer', members: members(ada) } },
		{ as: master },
	)
	await Role.create(
		{ data: { name: 'team', members: members(ada, grace) } },
		{ as: master },
	)
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
		expect(await request(create, {}, grace.token)).toMatchObject(
			refused('ACCESS_DENIED'),
		)
		expect(await request(create, {}, ada.token)).toMatchObject({
			data: { createNote: { title: 'Plans' } },
		})
	})
})

describe('a note’s ACL', () => {
	it('keeps a new note to its author', async () => {
		const { ada, grace } = await team()
		await request(create, {}, ada.token)
		expect(await titles(ada.token)).toEqual(plans)
		expect(await titles(grace.token)).toEqual([])
	})

	it('lets a role read a note its writer shares, and no more', async () => {
		const { ada, grace, bob } = await team()
		const note = at(
			await request(create, {}, ada.token),
			'data',
			'createNote',
			'id',
		)
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
	})
})
