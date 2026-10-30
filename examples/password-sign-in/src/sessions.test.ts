// Sessions: the token a sign-up or a sign-in opens, sent back as a Bearer
// header or as the cookie, and how a session ends.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { z } from 'zod'
import { app } from './app.ts'
import { User } from './models.ts'

const running = testApplication(app)

//#region request
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
//#endregion

const viewer = async (headers: Record<string, string>): Promise<unknown> => {
	const response = await post('{ viewer { name } }', {}, headers)
	return response.json()
}

const signedUp = z.object({
	data: z.object({ signUp: z.object({ token: z.string() }) }),
})

it('sends the token as a Bearer header', async () => {
	//#region bearer
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
	//#endregion
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
	//#region cookie
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
	//#endregion
})

it('signs up, signs in and ends sessions from server code', async () => {
	//#region commands
	const ada = await User.signUp(
		{
			email: 'ada@example.com',
			password: 'correct horse',
			data: { name: 'Ada' },
		},
		{ as: master },
	)
	// Opens a session, as the signIn function does, without its cookie.
	const { token, user } = await User.signIn({
		email: 'ada@example.com',
		password: 'correct horse',
	})
	expect(user?.name).toBe('Ada')

	// Ends every session of the user, on every device.
	await User.revokeSessions({ id: ada.id }, { as: master })
	// The request is refused before it runs, whatever it asks.
	const revoked = await post(
		'{ viewer { name } }',
		{},
		{
			authorization: `Bearer ${token}`,
		},
	)
	expect(revoked.status).toBe(401)
	expect(await revoked.json()).toEqual({
		code: 'UNAUTHENTICATED',
		message: 'The session expired or was revoked: sign in again.',
	})
	//#endregion
})
