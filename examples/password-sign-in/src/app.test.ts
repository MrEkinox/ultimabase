// Uses the application as a client would, each test on a new in-memory
// database: sign-up, sign-in, and the rules that read the signed-in user.
// Each request file a page shows is sent here and its response compared with
// its JSON file (D-282).
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { requestFiles } from '../../../scripts/requests.ts'
import { app } from './app.ts'
import { Poll, Post } from './models.ts'
import { User } from './user.ts'

const { send, file, check } = requestFiles(
	new URL('requests/', import.meta.url),
	testApplication(app),
)

/** The value under `path` in a response body. */
const at = (value: unknown, ...path: string[]): unknown =>
	path.reduce<unknown>((inner, key) => Reflect.get(Object(inner), key), value)

const refused = (code: string) => ({ errors: [{ extensions: { code } }] })

/** A user signed up, with the headers of their session. */
async function signUp(name: string) {
	const body = await send(
		`mutation ($input: SignUpInput!) { signUp(input: $input) { token user { id } } }`,
		{
			input: {
				email: `${name.toLowerCase()}@example.com`,
				password: 'correct horse',
				name,
			},
		},
	)
	const id = String(at(body, 'data', 'signUp', 'user', 'id'))
	const token = String(at(body, 'data', 'signUp', 'token'))
	return {
		id,
		token,
		bearer: { headers: { authorization: `Bearer ${token}` } },
	}
}

/** Ada's draft post, with Ada and Grace signed up. */
async function written() {
	const ada = await signUp('Ada')
	const grace = await signUp('Grace')
	const body = await check('create-post', {}, ada.bearer)
	return { ada, grace, post: String(at(body, 'data', 'createPost', 'id')) }
}

const signIn = (password: string) =>
	send(
		`mutation ($input: SignInInput!) { signIn(input: $input) { user { id name editor } } }`,
		{ input: { email: 'ada@example.com', password } },
	)

describe('signing up and in', () => {
	it('signs up, then signs in with the same password', async () => {
		const ada = await signUp('Ada')
		expect(await signIn('correct horse')).toEqual({
			data: { signIn: { user: { id: ada.id, name: 'Ada', editor: false } } },
		})
		const viewer = await send('{ viewer { name } }', {}, ada.bearer)
		expect(viewer).toEqual({ data: { viewer: { name: 'Ada' } } })
	})

	it('refuses a wrong password', async () => {
		await signUp('Ada')
		expect(await signIn('wrong horse')).toMatchObject(
			refused('INVALID_CREDENTIALS'),
		)
	})
})

describe('the rules on posts', () => {
	it('lets a signed-in user write a post, which is theirs', async () => {
		const ada = await signUp('Ada')
		//#region own-post
		// A visitor cannot write a post; Ada can, and it is hers.
		expect(await file('create-post')).toMatchObject({
			errors: [{ extensions: { code: 'ACCESS_DENIED' } }],
		})
		await check('create-post', {}, ada.bearer)
		//#endregion
	})

	it('shows a draft to its author only, and a published post to all', async () => {
		const { ada, grace, post } = await written()
		//#region drafts
		// A draft is its author's: a visitor and Grace see none.
		const none = { data: { posts: { edges: [] } } }
		expect(await file('posts')).toEqual(none)
		expect(await file('posts', {}, grace.bearer)).toEqual(none)
		await check('posts', {}, ada.bearer)
		//#endregion
		//#region draft-publish
		// Grace cannot see the draft, so it does not exist for her.
		expect(await file('publish', { id: post }, grace.bearer)).toMatchObject({
			errors: [{ extensions: { code: 'NOT_FOUND' } }],
		})
		await check('publish', { id: post }, ada.bearer)
		//#endregion
		//#region published
		// Everyone reads it now, but only its author changes it.
		await check('posts')
		expect(await file('publish', { id: post }, grace.bearer)).toMatchObject({
			errors: [{ extensions: { code: 'ACCESS_DENIED' } }],
		})
		//#endregion
	})

	it('lists the signed-in user’s own posts with viewer', async () => {
		const { ada, grace } = await written()
		await file('create-post', {}, grace.bearer)
		await Post.updateMany({ data: { published: true } }, { as: master })
		//#region viewer
		// No user id to send: the server reads the caller.
		await check('mine', {}, ada.bearer)
		// A visitor is no user: `viewer: true` holds for no post.
		expect(await file('mine')).toEqual({ data: { posts: { edges: [] } } })
		//#endregion
		expect(at(await file('mine', {}, grace.bearer), 'data')).toEqual({
			posts: { edges: [{ node: { author: { name: 'Grace' } } }] },
		})
		// `viewer` is on the relations to the user model only.
		const wrong = User.count(
			// @ts-expect-error -- posts relates to Post, not to the user model.
			{ where: { posts: { viewer: true } } },
			{ as: master },
		)
		await expect(wrong).rejects.toMatchObject({ code: 'INVALID_QUERY' })
	})

	it('shows names to signed-in users only', async () => {
		const ada = await signUp('Ada')
		//#region names
		// A visitor sees no names; a signed-in user reads them.
		expect(await file('names')).toEqual({ data: { users: { edges: [] } } })
		await check('names', {}, ada.bearer)
		//#endregion
	})

	it('lets each user rename only themself, and no client make an editor', async () => {
		const { ada, grace } = await written()
		const { id } = grace
		const rename = `mutation ($id: ID!) {
			updateUser(where: { id: $id }, data: { name: "Grace" }) { name }
		}`
		expect(await send(rename, { id }, ada.bearer)).toMatchObject(
			refused('ACCESS_DENIED'),
		)
		expect(await send(rename, { id }, grace.bearer)).toEqual({
			data: { updateUser: { name: 'Grace' } },
		})
		const promote = `mutation ($id: ID!) {
			updateUser(where: { id: $id }, data: { editor: true }) { editor }
		}`
		expect(await send(promote, { id }, grace.bearer)).toMatchObject(
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
		expect(await send(remove, { id: post }, grace.bearer)).toMatchObject(
			refused('ACCESS_DENIED'),
		)
		// The server makes an editor, here as Master.
		await User.update(
			{ where: { id: grace.id }, data: { editor: true } },
			{ as: master },
		)
		expect(await send(remove, { id: post }, grace.bearer)).toEqual({
			data: { deletePost: { title: 'Hello' } },
		})
	})
})

describe('a poll', () => {
	it('shows each user their own vote', async () => {
		const ada = await signUp('Ada')
		const grace = await signUp('Grace')
		const poll = await Poll.create(
			{ data: { question: 'Tabs?' } },
			{ as: master },
		)
		const vote = `mutation ($poll: ID!) {
			createVote(data: { choice: "yes", poll: { connect: { id: $poll } } }) {
				choice
			}
		}`
		await send(vote, { poll: poll.id }, ada.bearer)
		await check('my-vote', {}, ada.bearer)
		//#region my-vote
		// Grace has not voted, and a visitor is no user.
		const nobody = {
			data: {
				polls: {
					edges: [
						{ node: { question: 'Tabs?', myVote: null, hasVoted: false } },
					],
				},
			},
		}
		expect(await file('my-vote', {}, grace.bearer)).toEqual(nobody)
		expect(await file('my-vote')).toEqual(nobody)
		//#endregion
		// The unique index refuses a second vote.
		expect(await send(vote, { poll: poll.id }, ada.bearer)).toMatchObject(
			refused('UNIQUE_VIOLATION'),
		)
	})
})
