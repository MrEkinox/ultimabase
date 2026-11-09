// Over a GraphQL WebSocket, which sets no cookie, signing up, in and changing a
// password are refused before they write anything (D-354).
import { afterEach, describe, expect, it } from 'vitest'
import {
	bearer,
	changeQuery,
	graphqlOf,
	signInQuery,
	signUpQuery,
	socketOf,
	started,
	tokenOf,
} from './test/app.ts'

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
})

async function server() {
	const running = await started(undefined, undefined, true)
	stop = async () => running.app.stop()
	return running.url
}

const ada = { email: 'ada@example.com', password: 'correct horse' }
const signUp = { input: { ...ada, name: 'Ada' } }
const refused = {
	data: null,
	errors: [
		expect.objectContaining({
			message: 'Signing in or out needs HTTP.',
			extensions: { code: 'BAD_REQUEST' },
		}),
	],
}

describe('over a WebSocket', () => {
	it('signUp creates no user', async () => {
		const url = await server()
		expect(await socketOf(url, signUpQuery, signUp)).toStrictEqual(refused)
		const created = await graphqlOf(url, signUpQuery, signUp)
		expect(tokenOf(created.body, 'signUp')).not.toBe('undefined')
	})

	it('signIn is refused before the password is checked', async () => {
		const url = await server()
		await graphqlOf(url, signUpQuery, signUp)
		const wrong = { input: { ...ada, password: 'wrong password' } }
		expect(await socketOf(url, signInQuery, wrong)).toStrictEqual(refused)
	})

	it('changePassword keeps the password and its session', async () => {
		const url = await server()
		const created = await graphqlOf(url, signUpQuery, signUp)
		const token = tokenOf(created.body, 'signUp')
		const input = { currentPassword: ada.password, newPassword: 'new horse!' }
		const changing = socketOf(url, changeQuery, { input }, `Bearer ${token}`)
		expect(await changing).toStrictEqual(refused)
		const signedIn = await graphqlOf(url, signInQuery, { input: ada })
		expect(tokenOf(signedIn.body, 'signIn')).not.toBe('undefined')
		const viewer = await graphqlOf(url, '{ viewer { id } }', {}, bearer(token))
		expect(viewer.body).toHaveProperty(['data', 'viewer', 'id'])
	})
})
