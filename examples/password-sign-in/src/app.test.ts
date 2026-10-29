// Uses the application as a client would, each test on a new in-memory
// database: sign-up, sign-in, and the rules that read the signed-in user.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { app } from './app.ts'
import { Post, User } from './models.ts'

const running = testApplication(app)

/** A GraphQL request's response body. */
async function request(
	query: string,
	variables: object = {},
	headers: Record<string, string> = {},
): Promise<unknown> {
	const response = await fetch(`${running.url}/graphql`, {
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

const create =
	'mutation { createPost(data: { title: "Hello" }) { id author { name } } }'

/** Ada's post, with Ada and Grace signed up. */
async function written() {
	const ada = await signUp('ada')
	const grace = await signUp('grace')
	const body = await request(create, {}, as(ada.token))
	return { ada, grace, post: String(at(body, 'data', 'createPost', 'id')) }
}

const titles = async (headers: Record<string, string> = {}) => {
	const body = await request(
		'{ posts { edges { node { title } } } }',
		{},
		headers,
	)
	return at(body, 'data', 'posts', 'edges')
}

const signIn = (password: string) =>
	request(
		`mutation ($input: SignInInput!) { signIn(input: $input) { user { id name editor } } }`,
		{ input: { email: 'ada@example.com', password } },
	)

describe('signing up and in', () => {
	it('signs up, then signs in with the same password', async () => {
		const ada = await signUp('ada')
		expect(await signIn('correct horse')).toEqual({
			data: { signIn: { user: { id: ada.id, name: 'ada', editor: false } } },
		})
		const viewer = await request('{ viewer { name } }', {}, as(ada.token))
		expect(viewer).toEqual({ data: { viewer: { name: 'ada' } } })
	})

	it('refuses a wrong password', async () => {
		await signUp('ada')
		expect(await signIn('wrong horse')).toMatchObject(
			refused('INVALID_CREDENTIALS'),
		)
	})
})

describe('the rules on posts', () => {
	it('lets a signed-in user write a post, which is theirs', async () => {
		const ada = await signUp('ada')
		expect(await request(create)).toMatchObject(refused('ACCESS_DENIED'))
		const body = await request(create, {}, as(ada.token))
		expect(at(body, 'data', 'createPost', 'author')).toEqual({ name: 'ada' })
	})

	it('shows a draft to its author only, and a published post to all', async () => {
		//#region drafts
		const { ada, grace, post } = await written()
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
		//#endregion
	})

	it('shows names to signed-in users only', async () => {
		//#region names
		const ada = await signUp('ada')
		const names = '{ users { edges { node { name } } } }'
		expect(await request(names)).toEqual({ data: { users: { edges: [] } } })
		expect(await request(names, {}, as(ada.token))).toEqual({
			data: { users: { edges: [{ node: { name: 'ada' } }] } },
		})
		//#endregion
	})

	it('lets each user rename only themself, and no client make an editor', async () => {
		const { ada, grace } = await written()
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
		const promote = `mutation ($id: ID!) {
			updateUser(where: { id: $id }, data: { editor: true }) { editor }
		}`
		expect(await request(promote, { id }, as(grace.token))).toMatchObject(
			refused('ACCESS_DENIED'),
		)
	})

	it('lets an editor delete anyone’s post', async () => {
		const { grace, post } = await written()
		await Post.update(
			{ where: { id: post }, data: { published: true } },
			{ as: master },
		)
		const remove = `mutation ($id: ID!) { deletePost(where: { id: $id }) { title } }`
		expect(await request(remove, { id: post }, as(grace.token))).toMatchObject(
			refused('ACCESS_DENIED'),
		)
		// The server makes an editor, here as Master.
		await User.update(
			{ where: { id: grace.id }, data: { editor: true } },
			{ as: master },
		)
		expect(await request(remove, { id: post }, as(grace.token))).toEqual({
			data: { deletePost: { title: 'Hello' } },
		})
	})
})
