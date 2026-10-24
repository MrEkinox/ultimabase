// `authPlugin()` and `defineUser` (D-112): a session's token by Bearer or
// cookie, its lifetime, sign-out, revocation and the one user model.
import { httpPlugin } from '@ultimabase/http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Adapter } from 'ultimabase'
import { defineApp, memory } from 'ultimabase'
import { authPlugin, defineUser } from './index.ts'
import { AuthSession } from './sessions.ts'
import {
	bearer,
	callerOf,
	cookie,
	day,
	listening,
	M,
	signIn,
	started,
	User,
} from './test/app.ts'
import { cookieOf, setCookie } from './token.ts'

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	vi.restoreAllMocks()
	await stop?.()
	stop = undefined
})

/** A database where a session's renewal meets its sign-out. */
function signingOutOnRenewal(): Adapter {
	const database = memory()
	return {
		start: async (schema) => database.start(schema),
		stop: async () => database.stop(),
		begin: async () => database.begin(),
		find: async (read) => database.find(read),
		count: async (read) => database.count(read),
		write: async (write) => {
			const [change] = write.changes
			if (change?.kind === 'update' && change.model === 'AuthSession') {
				await database.write({
					changes: [{ kind: 'delete', model: 'AuthSession', where: {} }],
				})
			}
			return database.write(write)
		},
	}
}

async function server() {
	const running = await started()
	stop = async () => running.app.stop()
	return running
}

describe('a session', () => {
	it('sets an HttpOnly cookie, and identifies by Bearer or cookie', async () => {
		const { url, ada } = await server()
		const signed = await signIn(url, ada.id)
		expect(signed.setCookie).toBe(
			`ultimabase_session=${signed.token}; Max-Age=34560000; Path=/; HttpOnly; SameSite=Lax`,
		)
		const user = { kind: 'user', user: { id: ada.id, email: ada.email } }
		const byBearer = await callerOf(url, bearer(signed.token))
		expect(byBearer).toMatchObject({ status: 200, body: user })
		const byCookie = await callerOf(url, cookie(signed.token))
		expect(byCookie).toMatchObject({ status: 200, body: user })
	})

	it('reads the Bearer before the cookie', async () => {
		const { url, ada } = await server()
		const grace = await User.create({ data: { email: 'grace@example.com' } }, M)
		const first = await signIn(url, ada.id)
		const second = await signIn(url, grace.id)
		const both = await callerOf(url, {
			...bearer(first.token),
			...cookie(second.token),
		})
		expect(both.body).toMatchObject({ user: { id: ada.id } })
	})

	it('leaves another Authorization scheme to other plugins', async () => {
		const { url, ada } = await server()
		const { token } = await signIn(url, ada.id)
		const basic = { authorization: 'Basic YWRhOnNlY3JldA==' }
		expect((await callerOf(url, basic)).body).toStrictEqual({
			kind: 'anonymous',
		})
		const withCookie = await callerOf(url, { ...basic, ...cookie(token) })
		expect(withCookie.body).toMatchObject({ user: { id: ada.id } })
	})

	it('refuses an unknown or empty Bearer with 401', async () => {
		const { url } = await server()
		for (const authorization of ['Bearer nope', 'Bearer', 'bearer   ']) {
			const refused = await callerOf(url, { authorization })
			expect(refused).toMatchObject({
				status: 401,
				body: {
					code: 'UNAUTHENTICATED',
					message: 'The session expired or was revoked: sign in again.',
				},
			})
		}
	})

	it('refuses the Bearer of a session whose user is gone', async () => {
		const { url } = await server()
		const { token } = await signIn(url, 'ghost')
		expect((await callerOf(url, bearer(token))).status).toBe(401)
	})

	it('leaves a stale cookie anonymous, so the browser can sign in again', async () => {
		const { url } = await server()
		const stale = await callerOf(url, cookie('nope'))
		expect(stale).toStrictEqual({ status: 200, body: { kind: 'anonymous' } })
		const other = await callerOf(url, { cookie: 'theme=dark' })
		expect(other.body).toStrictEqual({ kind: 'anonymous' })
	})

	it('stores the token’s digest only', async () => {
		const { url, ada } = await server()
		const { token } = await signIn(url, ada.id)
		const [session] = await AuthSession.findMany({}, M)
		expect(session?.userId).toBe(ada.id)
		expect(session?.tokenHash).not.toBe(token)
		expect(session?.tokenHash).toMatch(/^[\w-]{43}$/)
	})
})

describe('a session’s lifetime', () => {
	it('ends 30 days after its last use, and is deleted', async () => {
		const { url, ada } = await server()
		const { token } = await signIn(url, ada.id)
		const now = Date.now()
		vi.spyOn(Date, 'now').mockReturnValue(now + 30 * day + 1)
		expect((await callerOf(url, bearer(token))).status).toBe(401)
		expect(await AuthSession.count({}, M)).toBe(0)
	})

	it('is renewed when used with less than 15 days left', async () => {
		const { url, ada } = await server()
		const { token } = await signIn(url, ada.id)
		const now = Date.now()
		vi.spyOn(Date, 'now').mockReturnValue(now + 20 * day)
		expect((await callerOf(url, bearer(token))).status).toBe(200)
		const [renewed] = await AuthSession.findMany({}, M)
		expect(renewed?.expiresAt.getTime()).toBe(now + 50 * day)
	})

	it('ends when signed out while it is renewed', async () => {
		const running = await started(signingOutOnRenewal())
		stop = async () => running.app.stop()
		const { token } = await signIn(running.url, running.ada.id)
		vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 20 * day)
		const renewed = await callerOf(running.url, bearer(token))
		expect(renewed.status).toBe(401)
	})

	it('keeps its end when used with more than 15 days left', async () => {
		const { url, ada } = await server()
		const { token } = await signIn(url, ada.id)
		const [opened] = await AuthSession.findMany({}, M)
		vi.spyOn(Date, 'now').mockReturnValue(Date.now() + day)
		expect((await callerOf(url, bearer(token))).status).toBe(200)
		const [used] = await AuthSession.findMany({}, M)
		expect(used?.expiresAt).toStrictEqual(opened?.expiresAt)
	})

	it('signing in ends the user’s expired sessions', async () => {
		const { url, ada } = await server()
		await signIn(url, ada.id)
		vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * day)
		await signIn(url, ada.id)
		expect(await AuthSession.count({}, M)).toBe(1)
	})
})

const signOut = async (url: string, headers: Record<string, string>) =>
	fetch(`${url}/auth/sign-out`, { method: 'POST', headers })

describe('signing out', () => {
	it('ends the Bearer’s or the cookie’s session and clears the cookie', async () => {
		const { url, ada } = await server()
		for (const carry of [bearer, cookie]) {
			const { token } = await signIn(url, ada.id)
			const response = await signOut(url, carry(token))
			expect(response.status).toBe(204)
			expect(response.headers.get('set-cookie')).toBe(
				'ultimabase_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
			)
			expect((await callerOf(url, bearer(token))).status).toBe(401)
		}
		expect(await AuthSession.count({}, M)).toBe(0)
	})

	it('answers 204 without a session', async () => {
		const { url } = await server()
		expect((await signOut(url, {})).status).toBe(204)
	})
})

describe('revoking', () => {
	it('ends every session of the user', async () => {
		const { url, ada } = await server()
		const first = await signIn(url, ada.id)
		const second = await signIn(url, ada.id)
		await fetch(`${url}/revoke`, {
			method: 'POST',
			body: JSON.stringify({ id: ada.id }),
		})
		expect((await callerOf(url, bearer(first.token))).status).toBe(401)
		expect((await callerOf(url, bearer(second.token))).status).toBe(401)
	})

	it('happens when the user is deleted', async () => {
		const { url, ada } = await server()
		await signIn(url, ada.id)
		await User.delete({ where: { id: ada.id } }, M)
		expect(await AuthSession.count({}, M)).toBe(0)
	})
})

describe('the user model', () => {
	const Member = defineUser({
		name: 'Member',
		dbName: 'members',
		fields: (f) => ({ name: f.string() }),
	})

	it('is required', async () => {
		const app = defineApp({
			database: memory(),
			plugins: [httpPlugin({ port: 0 }), authPlugin()],
			models: [],
			logger: listening([]),
		})
		await expect(app.start()).rejects.toThrow(
			'authPlugin() needs a user model: declare it with defineUser (D-62).',
		)
	})

	it('is one', async () => {
		const app = defineApp({
			database: memory(),
			plugins: [httpPlugin({ port: 0 }), authPlugin()],
			models: [User, Member],
			logger: listening([]),
		})
		await expect(app.start()).rejects.toThrow(
			'models lists two models defineUser returned: an application has one user model (D-62).',
		)
	})
})

describe('the cookie', () => {
	const environment = process.env['NODE_ENV']
	afterEach(() => {
		process.env['NODE_ENV'] = environment
	})

	it('is Secure and __Host- in production', () => {
		process.env['NODE_ENV'] = 'production'
		const production = cookieOf()
		expect(production).toStrictEqual({
			name: '__Host-ultimabase_session',
			secure: true,
		})
		const headers: string[] = []
		setCookie(
			{ header: (_, value) => headers.push(value ?? '') },
			production,
			't',
		)
		expect(headers).toStrictEqual([
			'__Host-ultimabase_session=t; Max-Age=34560000; Path=/; HttpOnly; Secure; SameSite=Lax',
		])
	})
})
