// Sessions: the token a sign-up or a sign-in opens, sent back as a Bearer
// header or as the cookie, how a session ends, and closing an account.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { z } from 'zod'
import { requestFiles } from '../../../scripts/requests.ts'
import { app } from './app.ts'
import { User } from './user.ts'

const running = testApplication(app)
const { file, check } = requestFiles(
	new URL('requests/', import.meta.url),
	running,
)
const as = { as: master }

/** A GraphQL request, and its response. */
const post = (
	query: string,
	variables: object = {},
	headers: Record<string, string> = {},
): Promise<Response> =>
	fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify({ query, variables }),
	})

const viewer = async (headers: Record<string, string>): Promise<unknown> => {
	const response = await post('{ viewer { name } }', {}, headers)
	return response.json()
}

const signedUp = z.object({
	data: z.object({ signUp: z.object({ token: z.string() }) }),
})

it('sends the token as a Bearer header', async () => {
	const response = await post(
		`mutation ($input: SignUpInput!) {
			signUp(input: $input) { token expiresAt user { name } }
		}`,
		{
			input: {
				email: 'ada@example.com',
				password: 'correct horse',
				name: 'Ada',
			},
		},
	)
	const { token } = signedUp.parse(await response.json()).data.signUp
	const bearer = { authorization: `Bearer ${token}` }
	expect(await viewer(bearer)).toEqual({ data: { viewer: { name: 'Ada' } } })
	expect(await viewer({})).toEqual({ data: { viewer: null } })
})

it('sets the cookie a browser sends back', async () => {
	await User.signUp(
		{
			email: 'ada@example.com',
			password: 'correct horse',
			data: { name: 'Ada' },
		},
		{ as: master },
	)
	const response = await post(
		`mutation ($input: SignInInput!) { signIn(input: $input) { user { name } } }`,
		{ input: { email: 'ada@example.com', password: 'correct horse' } },
	)
	const set = response.headers.get('set-cookie') ?? ''
	expect(set).toMatch(
		/^ultimabase_session=.+; Max-Age=\d+; Path=\/; HttpOnly; SameSite=Lax$/,
	)
	// A browser sends it back by itself.
	const cookie = { cookie: set.split(';')[0] ?? '' }
	expect(await viewer(cookie)).toEqual({ data: { viewer: { name: 'Ada' } } })

	// signOut ends the session and clears the cookie.
	const out = await post('mutation { signOut }', {}, cookie)
	expect(await out.json()).toEqual({ data: { signOut: true } })
	expect(out.headers.get('set-cookie')).toMatch(
		/^ultimabase_session=; Max-Age=0/,
	)
	// A stale cookie is anonymous, so the browser can sign in again.
	expect(await viewer(cookie)).toEqual({ data: { viewer: null } })
})

it('sends the token a request file returns', async () => {
	const input = {
		email: 'ada@example.com',
		password: 'correct horse',
		name: 'Ada',
	}
	const body = signedUp.parse(await file('sign-up', { input }))
	const { token } = body.data.signUp
	const bearer = { headers: { authorization: `Bearer ${token}` } }
	// With the token the caller is Ada; without it, no one.
	await check('viewer', {}, bearer)
	expect(await file('viewer')).toEqual({ data: { viewer: null } })
})

it('signs in from a request file, and ends the session of a cookie', async () => {
	const credentials = { email: 'ada@example.com', password: 'correct horse' }
	await User.signUp({ ...credentials, data: { name: 'Ada' } }, as)
	await check('sign-in', { input: credentials })
	//#region session-cookie
	const { token } = await User.signIn(credentials)
	const cookie = { headers: { cookie: `ultimabase_session=${token}` } }
	//#endregion
	await check('viewer', {}, cookie)
	await check('sign-out', {}, cookie)
	// The session has ended, so the cookie is stale: no one.
	expect(await file('viewer', {}, cookie)).toEqual({ data: { viewer: null } })
})

it('signs up, signs in and ends sessions from server code', async () => {
	//#region commands
	const credentials = { email: 'ada@example.com', password: 'correct horse' }
	// Creates the user, and opens no session.
	const ada = await User.signUp({ ...credentials, data: { name: 'Ada' } }, as)
	// Opens a session, as the signIn function does, without its cookie.
	const { token, user } = await User.signIn(credentials)
	expect(user?.name).toBe('Ada')
	//#endregion

	//#region revoke
	// Ends every session of the user, on every device.
	await User.revokeSessions({ id: ada.id }, as)
	//#endregion
	// The request is refused before it runs, whatever it asks.
	const headers = { authorization: `Bearer ${token}` }
	await check('ended', {}, { headers, status: 401 })
})

it('deletes a user and frees its email', async () => {
	const credentials = { email: 'ada@example.com', password: 'correct horse' }
	const ada = await User.signUp({ ...credentials, data: { name: 'Ada' } }, as)
	//#region delete
	// Ends the sessions and deletes the password and the linked accounts.
	await User.delete({ where: { id: ada.id } }, as)
	await expect(User.signIn(credentials)).rejects.toMatchObject({
		code: 'INVALID_CREDENTIALS',
	})
	//#endregion
	//#region delete-again
	// The email signs up again, as a new user.
	const again = await User.signUp(
		{ ...credentials, password: 'another horse', data: { name: 'Ada' } },
		as,
	)
	expect(again.id).not.toBe(ada.id)
	//#endregion
})
