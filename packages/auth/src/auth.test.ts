// `authPlugin()` and `defineUser` (D-112, D-113): a session's token by Bearer
// or cookie, its lifetime, sign-out, revocation, `viewer`, linked accounts
// and the one user model.
import { graphqlPlugin } from '@ultimabase/graphql'
import { get } from 'node:http'
import { httpPlugin } from '@ultimabase/http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Adapter, Caller, PluginTypes } from 'ultimabase'
import { defineApp, definePlugin, memory } from 'ultimabase'
import { recording } from 'ultimabase/internal'
import { AuthAccount } from './accounts.ts'
import { authPlugin, defineUser } from './index.ts'
import { AuthSession } from './sessions.ts'
import {
	bearer,
	callerOf,
	cookie,
	day,
	functionNamed,
	given,
	graphqlOf,
	listening,
	M,
	signIn,
	started,
	User,
} from './test/app.ts'

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
		start: async (schema, logger) => database.start(schema, logger),
		stop: async () => database.stop(),
		begin: async () => {
			const tx = await database.begin()
			return {
				...tx,
				// Signed out just before the renewal locks its row (D-104).
				find: async (read) => {
					if (read.lock === true && read.model === 'AuthSession') {
						await tx.write({
							changes: [{ kind: 'delete', model: 'AuthSession', where: {} }],
						})
					}
					return tx.find(read)
				},
			}
		},
		find: async (read) => database.find(read),
		count: async (read) => database.count(read),
		aggregate: async (read) => database.aggregate(read),
		write: async (write) => database.write(write),
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

	it('ends one year after its sign-in, however often it is used', async () => {
		const { url, ada } = await server()
		const { token } = await signIn(url, ada.id)
		const [opened] = await AuthSession.findMany({}, M)
		const now = opened?.createdAt.getTime() ?? 0
		for (let used = 20; used < 365; used += 20) {
			vi.spyOn(Date, 'now').mockReturnValue(now + used * day)
			expect((await callerOf(url, bearer(token))).status).toBe(200)
		}
		const [renewed] = await AuthSession.findMany({}, M)
		expect(renewed?.expiresAt.getTime()).toBe(now + 365 * day)
		// Renewed to its end on day 340, it is not written again on day 360.
		expect(renewed?.updatedAt.getTime()).toBe(now + 340 * day)
		vi.spyOn(Date, 'now').mockReturnValue(now + 365 * day + 1)
		expect((await callerOf(url, bearer(token))).status).toBe(401)
	})

	it('ends when signed out while it is renewed', async () => {
		const running = await started(signingOutOnRenewal())
		stop = async () => running.app.stop()
		const { token } = await signIn(running.url, running.ada.id)
		vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 20 * day)
		const renewed = await callerOf(running.url, bearer(token))
		expect(renewed.status).toBe(401)
	})

	it('tells when the caller it builds stops holding', async () => {
		const { url, ada } = await server()
		const { token } = await signIn(url, ada.id)
		const identified = async () =>
			recording(async () =>
				given.identify?.(new Request(url, { headers: bearer(token) })),
			)
		const [opened] = await AuthSession.findMany({}, M)
		expect((await identified()).expires).toStrictEqual(opened?.expiresAt)
		const now = Date.now()
		vi.spyOn(Date, 'now').mockReturnValue(now + 20 * day)
		expect((await identified()).expires).toStrictEqual(new Date(now + 50 * day))
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

	it('signing in again ends the cookie’s session, not a Bearer’s', async () => {
		const { url, ada } = await server()
		const kept = await signIn(url, ada.id)
		const replaced = await signIn(url, ada.id)
		const again = await signIn(url, ada.id, cookie(replaced.token))
		await signIn(url, ada.id, bearer(kept.token))
		expect((await callerOf(url, bearer(replaced.token))).status).toBe(401)
		expect((await callerOf(url, bearer(kept.token))).status).toBe(200)
		expect((await callerOf(url, bearer(again.token))).status).toBe(200)
	})

	it('signing in ends every expired session, whoever’s it was', async () => {
		const { url, ada } = await server()
		const bob = await User.create({ data: { email: 'bob@example.com' } }, M)
		await signIn(url, ada.id)
		await signIn(url, bob.id)
		vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * day)
		await signIn(url, ada.id)
		expect(await AuthSession.count({}, M)).toBe(1)
	})
})

const signOut = async (url: string, headers: Record<string, string>) =>
	graphqlOf(url, 'mutation { signOut }', headers)
const cleared = 'ultimabase_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax'

describe('signing out', () => {
	it('ends the Bearer’s or the cookie’s session and clears the cookie', async () => {
		const { url, ada } = await server()
		for (const carry of [bearer, cookie]) {
			const { token } = await signIn(url, ada.id)
			const signedOut = await signOut(url, carry(token))
			expect(signedOut).toStrictEqual({
				status: 200,
				body: { data: { signOut: true } },
				setCookie: [cleared],
			})
			expect((await callerOf(url, bearer(token))).status).toBe(401)
		}
		expect(await AuthSession.count({}, M)).toBe(0)
	})

	it('ends the session of a caller its plugins completed', async () => {
		interface Badge extends PluginTypes {
			readonly name: 'badge'
		}
		const badge = definePlugin<Badge>({
			name: 'badge',
			manifest: { name: 'badge', version: '1.0.0' },
			caller: () => ({ badge: 'gold' }),
		})
		const running = await started(memory(), [badge.plugin()])
		stop = async () => running.app.stop()
		const { url, ada } = running
		const { token } = await signIn(url, ada.id)
		const completed = await callerOf(url, bearer(token))
		expect(completed.body).toMatchObject({ badge: 'gold' })
		await signOut(url, bearer(token))
		expect((await callerOf(url, bearer(token))).status).toBe(401)
	})

	it('ends only the request’s session', async () => {
		const { url, ada } = await server()
		const first = await signIn(url, ada.id)
		const second = await signIn(url, ada.id)
		await signOut(url, bearer(first.token))
		expect((await callerOf(url, bearer(second.token))).status).toBe(200)
	})

	it('clears the cookie without a session, or with a stale one', async () => {
		const { url } = await server()
		for (const headers of [{}, cookie('nope')]) {
			const signedOut = await signOut(url, headers)
			expect(signedOut.body).toStrictEqual({ data: { signOut: true } })
			expect(signedOut.setCookie).toStrictEqual([cleared])
		}
	})

	it('is no route', async () => {
		const { url } = await server()
		const response = await fetch(`${url}/auth/sign-out`, { method: 'POST' })
		expect(response.status).toBe(404)
	})

	it('from server code, ends no session and sets no cookie', async () => {
		const { url, ada } = await server()
		const { token } = await signIn(url, ada.id)
		await expect(functionNamed('signOut').run(undefined, M)).resolves.toBe(
			undefined,
		)
		expect((await callerOf(url, bearer(token))).status).toBe(200)
	})
})

describe('viewer', () => {
	it('is the caller’s user, read as the caller', async () => {
		const { url, ada } = await server()
		await User.update({ where: { id: ada.id }, data: { note: 'private' } }, M)
		const { token } = await signIn(url, ada.id)
		const read = await graphqlOf(url, '{ viewer { id email } }', bearer(token))
		expect(read.body).toStrictEqual({
			data: { viewer: { id: ada.id, email: ada.email } },
		})
		const caller: Caller = { kind: 'user', user: ada }
		const viewed = await functionNamed('viewer').run(undefined, { as: caller })
		expect(viewed).toMatchObject({ id: ada.id, email: ada.email })
		expect(viewed).not.toHaveProperty('note')
	})

	it('is null when anonymous, as Master, or when the rule refuses the row', async () => {
		const { url } = await server()
		const read = await graphqlOf(url, '{ viewer { id } }')
		expect(read.body).toStrictEqual({ data: { viewer: null } })
		const viewer = functionNamed('viewer')
		await expect(viewer.run(undefined, M)).resolves.toBeNull()
		const ghost: Caller = { kind: 'user', user: { id: 'ghost' } }
		await expect(viewer.run(undefined, { as: ghost })).resolves.toBeNull()
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

	it('is the command User.revokeSessions, as Master or as the user', async () => {
		const { url, ada } = await server()
		const grace = await User.create({ data: { email: 'grace@example.com' } }, M)
		const asAda: Caller = { kind: 'user', user: ada }
		const forged = { kind: 'master', master: { source: 'code' } } as const
		const refusals = [
			undefined,
			{},
			{ as: { kind: 'anonymous' } as const },
			{ as: { kind: 'user', user: grace } as const },
			{ as: forged },
		]
		const { token } = await signIn(url, ada.id)
		for (const options of refusals) {
			await expect(
				User.revokeSessions({ id: ada.id }, options),
			).rejects.toMatchObject({
				code: 'ACCESS_DENIED',
				message: 'User.revokeSessions runs as Master or as the user.',
			})
		}
		expect((await callerOf(url, bearer(token))).status).toBe(200)
		for (const options of [M, { as: asAda }]) {
			const signed = await signIn(url, ada.id)
			await User.revokeSessions({ id: ada.id }, options)
			expect((await callerOf(url, bearer(signed.token))).status).toBe(401)
		}
	})
})

describe('linked accounts', () => {
	it('find the user a method’s subject signs in as', async () => {
		const { ada } = await server()
		const auth = given.auth
		await auth?.linkAccount(ada.id, 'password', 'ada@example.com')
		await expect(
			auth?.accountOf('password', 'ada@example.com'),
		).resolves.toStrictEqual({ userId: ada.id })
		await expect(
			auth?.accountOf('google', 'ada@example.com'),
		).resolves.toBeUndefined()
	})

	it('give the subject a user is known by to a method', async () => {
		const { ada } = await server()
		const grace = await User.create({ data: { email: 'grace@example.com' } }, M)
		const auth = given.auth
		await auth?.linkAccount(grace.id, 'password', 'grace@example.com')
		await auth?.linkAccount(ada.id, 'google', '1234')
		await auth?.linkAccount(ada.id, 'password', 'ada@example.com')
		await expect(auth?.subjectOf(ada.id, 'password')).resolves.toBe(
			'ada@example.com',
		)
		await expect(auth?.subjectOf(ada.id, 'github')).resolves.toBeUndefined()
	})

	it('take a method’s subject once', async () => {
		const { ada } = await server()
		const grace = await User.create({ data: { email: 'grace@example.com' } }, M)
		await given.auth?.linkAccount(ada.id, 'password', 'ada@example.com')
		await given.auth?.linkAccount(ada.id, 'google', '1234')
		await expect(
			given.auth?.linkAccount(grace.id, 'password', 'ada@example.com'),
		).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
	})

	it('go with the user', async () => {
		const { ada } = await server()
		const grace = await User.create({ data: { email: 'grace@example.com' } }, M)
		await given.auth?.linkAccount(ada.id, 'password', 'ada@example.com')
		await given.auth?.linkAccount(grace.id, 'password', 'grace@example.com')
		await User.delete({ where: { id: ada.id } }, M)
		const left = await AuthAccount.findMany({}, M)
		expect(left.map(({ userId }) => userId)).toStrictEqual([grace.id])
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
			'authPlugin() needs a user model: declare it with defineUser.',
		)
	})

	it('is one', async () => {
		const app = defineApp({
			database: memory(),
			plugins: [httpPlugin({ port: 0 }), graphqlPlugin(), authPlugin()],
			models: [User, Member],
			logger: listening([]),
		})
		await expect(app.start()).rejects.toThrow(
			'models lists two models defineUser returned: an application has one user model.',
		)
	})
})

/** A request to `url` for `host`, which `fetch` cannot send. */
const sentTo = async (url: string, host: string) =>
	new Promise((resolve, reject) => {
		get(`${url}/caller`, { headers: { host } }, (response) => {
			response.resume().on('end', resolve)
		}).on('error', reject)
	})

describe('the cookie', () => {
	const environment = process.env['NODE_ENV']
	afterEach(() => {
		process.env['NODE_ENV'] = environment
	})

	it('warns once when sent to a host that is not local without Secure', async () => {
		const { url, warnings } = await server()
		for (const host of ['localhost', 'app.localhost', '127.0.0.1', '[::1]']) {
			await sentTo(url, host)
		}
		expect(warnings).toStrictEqual([])
		await sentTo(url, 'example.com')
		await sentTo(url, 'example.com')
		expect(warnings).toStrictEqual([
			'auth serves example.com a session cookie without Secure: set NODE_ENV=production.',
		])
	})

	it('carries no mutation a page of another site can send (D-115)', async () => {
		const { url, ada } = await server()
		const { token } = await signIn(url, ada.id)
		const query = 'mutation { signOut }'
		// A link or an image sends a GET; a form, a POST that is not JSON.
		const linked = await fetch(
			`${url}/graphql?query=${encodeURIComponent(query)}`,
			{ headers: { accept: 'application/json', ...cookie(token) } },
		)
		expect(linked.status).toBe(405)
		for (const type of ['text/plain', 'application/x-www-form-urlencoded']) {
			const posted = await fetch(`${url}/graphql`, {
				method: 'POST',
				headers: { 'content-type': type, ...cookie(token) },
				body: JSON.stringify({ query }),
			})
			// http refuses a form with cookies from no allowed origin (D-106).
			expect(posted.status).toBe(403)
			const ownPage = await fetch(`${url}/graphql`, {
				method: 'POST',
				headers: {
					'content-type': type,
					'sec-fetch-site': 'same-origin',
					...cookie(token),
				},
				body: JSON.stringify({ query }),
			})
			expect(ownPage.status).toBe(415)
		}
		expect((await callerOf(url, cookie(token))).status).toBe(200)
		expect(await AuthSession.count({}, M)).toBe(1)
	})

	it('is Secure and __Host- in production, set and cleared so', async () => {
		process.env['NODE_ENV'] = 'production'
		const { url, ada } = await server()
		const signed = await signIn(url, ada.id)
		expect(signed.setCookie).toBe(
			`__Host-ultimabase_session=${signed.token}; Max-Age=34560000; Path=/; HttpOnly; Secure; SameSite=Lax`,
		)
		const session = { cookie: `__Host-ultimabase_session=${signed.token}` }
		const signedOut = await signOut(url, session)
		expect(signedOut.setCookie).toStrictEqual([
			'__Host-ultimabase_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax',
		])
		expect((await callerOf(url, bearer(signed.token))).status).toBe(401)
	})
})
