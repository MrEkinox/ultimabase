// Starts the example as `yarn start` does, then uses it as a client would:
// sign-up, sign-in, and the rules that read the signed-in user.
import type { ChildProcessByStdio } from 'node:child_process'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import type { Readable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const masterKey = 'example-master-key'
let server: ChildProcessByStdio<null, Readable, Readable>
let output = ''
let url = ''

beforeAll(async () => {
	server = spawn(process.execPath, ['src/server.ts'], {
		cwd: new URL('..', import.meta.url),
		env: { ...process.env, PORT: '0', MASTER_KEY: masterKey },
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	server.stderr.on('data', (chunk) => {
		output += String(chunk)
	})
	url = await new Promise((resolve, reject) => {
		server.stdout.on('data', (chunk) => {
			output += String(chunk)
			const found = /Listening on (\S+)\./.exec(output)?.[1]
			if (found !== undefined) resolve(found)
		})
		server.once('exit', (code) => {
			reject(new Error(`The example exited with ${code}:\n${output}`))
		})
	})
})

/** Stops the example as a host does, with `SIGTERM`. */
async function stopped(): Promise<void> {
	if (server.exitCode !== null || server.signalCode !== null) return
	const exited = once(server, 'exit')
	server.kill('SIGTERM')
	await exited
}

afterAll(stopped)

/** A GraphQL request's response body. */
async function request(
	query: string,
	variables: object = {},
	headers: Record<string, string> = {},
): Promise<unknown> {
	const response = await fetch(`${url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify({ query, variables }),
	})
	return response.json()
}

/** The value under `path` in a response body. */
const at = (value: unknown, ...path: string[]): unknown =>
	path.reduce<unknown>((inner, key) => Reflect.get(Object(inner), key), value)

const as = (token: string) => ({ authorization: `Bearer ${token}` })
const asMaster = { 'x-ultimabase-master-key': masterKey }
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

const titles = async (headers: Record<string, string> = {}) => {
	const body = await request(
		'{ posts { edges { node { title } } } }',
		{},
		headers,
	)
	return at(body, 'data', 'posts', 'edges')
}

let ada = { id: '', token: '' }
let grace = { id: '', token: '' }
let post = ''

describe('signing up and in', () => {
	it('signs up, then signs in with the same password', async () => {
		ada = await signUp('ada')
		grace = await signUp('grace')
		const body = await request(
			`mutation ($input: SignInInput!) { signIn(input: $input) { user { id name editor } } }`,
			{ input: { email: 'ada@example.com', password: 'correct horse' } },
		)
		expect(body).toEqual({
			data: { signIn: { user: { id: ada.id, name: 'ada', editor: false } } },
		})
		const viewer = await request('{ viewer { name } }', {}, as(ada.token))
		expect(viewer).toEqual({ data: { viewer: { name: 'ada' } } })
	})

	it('refuses a wrong password', async () => {
		const body = await request(
			`mutation ($input: SignInInput!) { signIn(input: $input) { token } }`,
			{ input: { email: 'ada@example.com', password: 'wrong horse' } },
		)
		expect(body).toMatchObject(refused('INVALID_CREDENTIALS'))
	})
})

describe('the rules on posts', () => {
	const create =
		'mutation { createPost(data: { title: "Hello" }) { id author { name } } }'

	it('lets a signed-in user write a post, which is theirs', async () => {
		expect(await request(create)).toMatchObject(refused('ACCESS_DENIED'))
		const body = await request(create, {}, as(ada.token))
		expect(at(body, 'data', 'createPost', 'author')).toEqual({ name: 'ada' })
		post = String(at(body, 'data', 'createPost', 'id'))
	})

	it('shows a draft to its author only, and a published post to all', async () => {
		const hello = [{ node: { title: 'Hello' } }]
		expect(await titles()).toEqual([])
		expect(await titles(as(grace.token))).toEqual([])
		expect(await titles(as(ada.token))).toEqual(hello)
		const publish = `mutation ($id: ID!) {
			updatePost(where: { id: $id }, data: { published: true }) { published }
		}`
		// Grace cannot see the draft, so it does not exist for her.
		expect(await request(publish, { id: post }, as(grace.token))).toMatchObject(
			refused('NOT_FOUND'),
		)
		expect(await request(publish, { id: post }, as(ada.token))).toEqual({
			data: { updatePost: { published: true } },
		})
		expect(await titles()).toEqual(hello)
		// Now she sees it, but it is not hers.
		expect(await request(publish, { id: post }, as(grace.token))).toMatchObject(
			refused('ACCESS_DENIED'),
		)
	})

	it('lets an editor delete anyone’s post, and only Master make one', async () => {
		const remove = `mutation ($id: ID!) { deletePost(where: { id: $id }) { title } }`
		expect(await request(remove, { id: post }, as(grace.token))).toMatchObject(
			refused('ACCESS_DENIED'),
		)
		const promote = `mutation ($id: ID!) {
			updateUser(where: { id: $id }, data: { editor: true }) { editor }
		}`
		const { id } = grace
		const rename = `mutation ($id: ID!) {
			updateUser(where: { id: $id }, data: { name: "Grace" }) { name }
		}`
		expect(await request(rename, { id }, as(ada.token))).toMatchObject(
			refused('ACCESS_DENIED'),
		)
		expect(await request(rename, { id }, as(grace.token))).toEqual({
			data: { updateUser: { name: 'Grace' } },
		})
		expect(await request(promote, { id }, as(grace.token))).toMatchObject(
			refused('ACCESS_DENIED'),
		)
		expect(await request(promote, { id }, asMaster)).toEqual({
			data: { updateUser: { editor: true } },
		})
		expect(await request(remove, { id: post }, as(grace.token))).toEqual({
			data: { deletePost: { title: 'Hello' } },
		})
	})
})

describe('stopping', () => {
	it('stops on SIGTERM', async () => {
		await stopped()
		expect(output).toContain('Application stopped.')
	})
})
