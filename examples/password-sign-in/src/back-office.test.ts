// Shorter sessions, as a back office sets them: a session ends 8 hours after
// its last use, and 7 days at most after the sign-in.
import { authPlugin } from '@ultimabase/auth'
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { passwordPlugin } from '@ultimabase/password'
import { testApplication } from '@ultimabase/testing'
import { defineApp, master, memory } from 'ultimabase'
import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { Post, User } from './models.ts'

//#region sessions
const hour = 60 * 60 * 1000

const backOffice = defineApp({
	database: memory(),
	plugins: [
		httpPlugin(),
		graphqlPlugin(),
		authPlugin({ sessions: { lifetime: 8 * hour, longest: 7 * 24 * hour } }),
		passwordPlugin({ signUp: ['name'] }),
	],
	models: [User, Post],
})
//#endregion

const running = testApplication(backOffice)
afterEach(() => {
	vi.restoreAllMocks()
})

const post = (query: string, variables: object, headers = {}) =>
	fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify({ query, variables }),
	})

const signedIn = z.object({
	data: z.object({ signIn: z.object({ token: z.string() }) }),
})

it('ends a session 8 hours after its last use', async () => {
	await User.signUp(
		{
			email: 'ada@example.com',
			password: 'correct horse',
			data: { name: 'Ada' },
		},
		{ as: master },
	)
	const response = await post(
		`mutation ($input: SignInInput!) { signIn(input: $input) { token } }`,
		{ input: { email: 'ada@example.com', password: 'correct horse' } },
	)
	// The cookie lives as long as the session can: 7 days.
	expect(response.headers.get('set-cookie')).toContain('; Max-Age=604800;')
	const { token } = signedIn.parse(await response.json()).data.signIn
	const bearer = { authorization: `Bearer ${token}` }
	vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 8 * hour + 1)
	const ended = await post('{ viewer { name } }', {}, bearer)
	expect(ended.status).toBe(401)
})
