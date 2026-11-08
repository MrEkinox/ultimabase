// The callers kept by token (D-332): a request whose session and user have
// not changed reads neither again; a revocation, a sign-out, a user changed
// or deleted is seen at the next request; a lost listener keeps nothing.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Adapter, Changed, Feed } from 'ultimabase'
import { memory } from 'ultimabase'
import { kept } from './cache.ts'
import { AuthSession } from './sessions.ts'
import {
	bearer,
	callerOf,
	cookie,
	day,
	graphqlOf,
	M,
	signIn,
	started,
	User,
} from './test/app.ts'

/** A memory database that counts its reads by model, and hands out its feed. */
function watched() {
	const database = memory()
	const reads = new Map<string, number>()
	let feed: Feed | undefined
	/** While set, a read of a session waits for it. */
	let hold: Promise<void> | undefined
	const counted = async <R extends { readonly model: string }, T>(
		read: R,
		run: (read: R) => Promise<T>,
	): Promise<T> => {
		reads.set(read.model, (reads.get(read.model) ?? 0) + 1)
		if (read.model === 'AuthSession' && hold !== undefined) await hold
		return run(read)
	}
	const adapter: Adapter = {
		...database,
		start: async (schema, logger, given) => {
			feed = given
			await database.start(schema, logger, given)
		},
		find: async (read) => counted(read, database.find),
		begin: async () => {
			const tx = await database.begin()
			return {
				...tx,
				find: async (read) => counted(read, async (each) => tx.find(each)),
			}
		},
	}
	return {
		adapter,
		read: (model: string) => reads.get(model) ?? 0,
		feed: (): Feed => {
			if (feed === undefined) throw new Error('auth takes the feed.')
			return feed
		},
		holding: (until: Promise<void>) => {
			hold = until
		},
	}
}

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	vi.restoreAllMocks()
	kept.most = 10_000
	await stop?.()
	stop = undefined
})

async function server() {
	const database = watched()
	const running = await started(database.adapter)
	stop = async () => running.app.stop()
	const { token } = await signIn(running.url, running.ada.id)
	const status = async (carry: Record<string, string> = bearer(token)) =>
		(await callerOf(running.url, carry)).status
	return { ...running, ...database, token, status }
}

/** The feed's deliveries, as memory sends them after a commit. */
const delivered = async () => new Promise((resolve) => setImmediate(resolve))

describe('a kept caller', () => {
	it('reads neither the session nor the user again', async () => {
		const { url, token, read } = await server()
		const first = await callerOf(url, bearer(token))
		const [sessions, users] = [read('AuthSession'), read('User')]
		const second = await callerOf(url, bearer(token))
		expect(second).toStrictEqual(first)
		expect([read('AuthSession'), read('User')]).toEqual([sessions, users])
		// A cookie's token is kept as a Bearer's is.
		expect((await callerOf(url, cookie(token))).body).toStrictEqual(first.body)
		expect(read('AuthSession')).toBe(sessions)
	})

	it('is given up when its sessions are revoked', async () => {
		const { url, ada, status } = await server()
		expect(await status()).toBe(200)
		await fetch(`${url}/revoke`, {
			method: 'POST',
			body: JSON.stringify({ id: ada.id }),
		})
		expect(await status()).toBe(401)
	})

	it('is given up when signed out, as a Bearer or a cookie', async () => {
		const { url, ada, status } = await server()
		const signedOut = async (
			carry: (token: string) => Record<string, string>,
		) => {
			const { token } = await signIn(url, ada.id)
			expect(await status(carry(token))).toBe(200)
			await graphqlOf(url, 'mutation { signOut }', carry(token))
			return callerOf(url, carry(token))
		}
		expect((await signedOut(bearer)).status).toBe(401)
		// A stale cookie is anonymous (D-112).
		expect((await signedOut(cookie)).body).toStrictEqual({ kind: 'anonymous' })
	})

	it('is read again once its user changes', async () => {
		const { url, ada, token } = await server()
		await callerOf(url, bearer(token))
		await User.update(
			{ where: { id: ada.id }, data: { email: 'ada@lovelace.dev' } },
			M,
		)
		await delivered()
		expect((await callerOf(url, bearer(token))).body).toMatchObject({
			user: { email: 'ada@lovelace.dev' },
		})
	})

	it('is given up once its user is deleted', async () => {
		const { ada, status } = await server()
		expect(await status()).toBe(200)
		await User.delete({ where: { id: ada.id } }, M)
		expect(await status()).toBe(401)
	})

	it('is kept through an insert', async () => {
		const { url, ada, token, read } = await server()
		await callerOf(url, bearer(token))
		const users = read('User')
		await User.create({ data: { email: 'grace@example.com' } }, M)
		await AuthSession.create(
			{
				data: {
					tokenHash: 'h',
					user: { connect: { id: ada.id } },
					expiresAt: new Date(),
				},
			},
			M,
		)
		await delivered()
		// An insert changes no kept row.
		await callerOf(url, bearer(token))
		expect(read('User')).toBe(users)
	})

	it('is read again once any session or user may have changed', async () => {
		const { token, read, feed, status } = await server()
		await status()
		const whole: readonly Changed[][] = [
			[{ kind: 'update', model: 'AuthSession' }],
			[{ kind: 'delete', model: 'User' }],
		]
		for (const changes of whole) {
			const users = read('User')
			feed().changed(changes)
			expect(await status(bearer(token))).toBe(200)
			expect(read('User')).toBe(users + 1)
		}
		// A change of another model, or of an unknown session, keeps it.
		const users = read('User')
		feed().changed([
			{ kind: 'update', model: 'AuthAccount' },
			{ kind: 'update', model: 'AuthSession', ids: ['unknown'] },
			{ kind: 'delete', model: 'User', ids: ['unknown'] },
		])
		await status()
		expect(read('User')).toBe(users)
	})

	it('is read again when its renewal is due, and renewed', async () => {
		const { token, read, status } = await server()
		await status()
		const [opened] = await AuthSession.findMany({}, M)
		const now = Date.now()
		vi.spyOn(Date, 'now').mockReturnValue(now + 10 * day)
		const sessions = read('AuthSession')
		expect(await status(bearer(token))).toBe(200)
		expect(read('AuthSession')).toBe(sessions)
		vi.spyOn(Date, 'now').mockReturnValue(now + 20 * day)
		expect(await status(bearer(token))).toBe(200)
		const [renewed] = await AuthSession.findMany({}, M)
		expect(renewed?.expiresAt.getTime()).toBeGreaterThan(
			opened?.expiresAt.getTime() ?? Infinity,
		)
	})

	it('is read again at its end when no renewal can pass it', async () => {
		const running = await started(watched().adapter, [], {
			sessions: { lifetime: 10 * day, longest: 10 * day },
		})
		stop = async () => running.app.stop()
		const { token } = await signIn(running.url, running.ada.id)
		expect((await callerOf(running.url, bearer(token))).status).toBe(200)
		vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 9 * day)
		expect((await callerOf(running.url, bearer(token))).status).toBe(200)
		vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10 * day + 1)
		expect((await callerOf(running.url, bearer(token))).status).toBe(401)
	})
})

describe('a lost listener', () => {
	it('keeps no caller until the feed is back', async () => {
		const { read, feed, status } = await server()
		await status()
		feed().lost()
		const users = read('User')
		await status()
		await status()
		expect(read('User')).toBe(users + 2)
		feed().missed()
		await status()
		await status()
		expect(read('User')).toBe(users + 3)
	})
})

describe('a read during a change', () => {
	it('keeps nothing', async () => {
		const { url, token, read, feed, holding } = await server()
		const { promise, resolve } = Promise.withResolvers<void>()
		holding(promise)
		const before = read('AuthSession')
		const reading = callerOf(url, bearer(token))
		await vi.waitFor(() => expect(read('AuthSession')).toBe(before + 1))
		feed().changed([{ kind: 'update', model: 'User', ids: ['other'] }])
		holding(Promise.resolve())
		resolve()
		expect((await reading).status).toBe(200)
		const users = read('User')
		await callerOf(url, bearer(token))
		expect(read('User')).toBe(users + 1)
	})
})

describe('the kept callers', () => {
	it('give up the oldest past the most', async () => {
		const { url, ada, token, read, status } = await server()
		kept.most = 2
		const second = await signIn(url, ada.id)
		const third = await signIn(url, ada.id)
		for (const each of [token, second.token, third.token]) {
			await status(bearer(each))
		}
		const users = read('User')
		await status(bearer(third.token))
		await status(bearer(second.token))
		expect(read('User')).toBe(users)
		await status(bearer(token))
		expect(read('User')).toBe(users + 1)
	})
})
