import type { Pool } from 'pg'
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { UltimaBase } from '@ultimabase/core'

import {
	authErrorCodes,
	authOperations,
	authPlugin,
	type AuthEvents,
} from '../../src/index.js'
import { fakeMethod } from './fake-method.js'
import {
	createProbeApplication,
	type ProbeApplicationOptions,
} from './probe-application.js'
import type { ProbeScenario } from './probe-method.js'

let fixture: PostgresWorkerFixture | undefined
const pool = (): Pool => {
	if (fixture === undefined) throw new TypeError('PostgreSQL is unavailable')
	return fixture.pool
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'auth_sessions' })
}, 30_000)
afterAll(async () => {
	await fixture?.dispose()
})
afterEach(() => {
	vi.useRealTimers()
})

const minute = 60_000
const day = 24 * 60 * minute
const invalidSession = { code: authErrorCodes.invalidSession }

const readUserId = (input: unknown): string => {
	if (typeof input !== 'string') throw new TypeError('A user id is required')
	return input
}

/** Scenarios standing in for a method's session handlers. */
const scenarios: Readonly<Record<string, ProbeScenario>> = {
	'complete-reset': async (services, context, input) => {
		await services.completePasswordReset(readUserId(input), context)
		return null
	},
	reauthenticate: async (services, context) => {
		await services.markAuthenticated(context)
		return null
	},
	'revoke-others': async (services, context) => {
		await services.revokeOtherSessionsOnPasswordChange(context)
		return null
	},
	whoami: (services, context) =>
		Promise.resolve(services.requireAuthenticated(context).userId),
}

/** Starts one probe application; the caller disposes it. */
const start = async (options: ProbeApplicationOptions = {}) => {
	const application = createProbeApplication(pool(), {
		scenarios,
		...options,
	})
	await application.ultimabase.start()
	return application
}

describe('session lifecycle', { concurrent: false }, () => {
	it('reads, rotates and revokes one session', async () => {
		const { ProbeUser, asUser, run, signIn, ultimabase } = await start()
		try {
			const { session, user } = await signIn('acct|lifecycle')
			expect(session.token).toMatch(/^ub_s1\.[\w-]{43}$/u)
			const current = await asUser(session.token, () => ProbeUser.current())
			expect(current.id).toBe(user.id)
			expect(await asUser(session.token, () => run('whoami'))).toBe(user.id)
			await expect(ProbeUser.current()).rejects.toMatchObject(invalidSession)
			await expect(run('whoami')).rejects.toMatchObject(invalidSession)

			const refreshed = await ProbeUser.refresh(session.token)
			expect(refreshed.session.id).toBe(session.id)
			expect(refreshed.session.token).not.toBe(session.token)
			expect(refreshed.user.id).toBe(user.id)
			await expect(
				asUser(session.token, () => ProbeUser.current()),
			).rejects.toMatchObject(invalidSession)

			// One scope keeps the session it began with: its second rotation is stale.
			const token = await asUser(refreshed.session.token, async () => {
				const next = await ultimabase
					.operation(authOperations.refresh)
					.execute(null)
				await expect(
					ultimabase.operation(authOperations.refresh).execute(null),
				).rejects.toMatchObject(invalidSession)
				return next.session.token
			})
			await asUser(token, async () => {
				await expect(ProbeUser.logout(token)).resolves.toStrictEqual({
					revoked: true,
				})
				await expect(
					ultimabase.operation(authOperations.logout).execute(null),
				).rejects.toMatchObject(invalidSession)
			})
			await expect(ProbeUser.logout(token)).rejects.toMatchObject(
				invalidSession,
			)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('keeps sessions across instances of the same application class', async () => {
		const first = await start()
		const { App, ProbeNote, ProbeUser } = first
		let signedIn: Awaited<ReturnType<typeof first.signIn>>
		try {
			signedIn = await first.signIn('acct|restart')
		} finally {
			await first.ultimabase.dispose()
		}
		// The plugin instance declares its private collections again, unchanged.
		const second = new App({ logger: false, schemas: [ProbeNote, ProbeUser] })
		await second.start()
		try {
			const current = await second
				.plugin(authPlugin)
				.runWithSession(signedIn.session.token, () => ProbeUser.current())
			expect(current.id).toBe(signedIn.user.id)
		} finally {
			await second.dispose()
		}
	})

	it('lists live sessions without tokens and revokes only the user’s own', async () => {
		const { ProbeUser, asUser, auth, signIn, ultimabase } = await start()
		try {
			const first = await signIn('acct|list')
			const second = await signIn('acct|list')
			const other = await signIn('acct|list-other')
			expect(second.user.id).toBe(first.user.id)

			const { sessions } = await asUser(second.session.token, () =>
				ProbeUser.listSessions(),
			)
			expect(
				sessions.map(({ current, id }) => [id, current]).sort(),
			).toStrictEqual(
				[
					[first.session.id, false],
					[second.session.id, true],
				].sort(),
			)
			expect(sessions[0]).toMatchObject({
				address: null,
				device: null,
				method: 'fake',
			})
			expect(JSON.stringify(sessions)).not.toContain('ub_s1.')

			const asSecond = <TResult>(work: () => Promise<TResult>) =>
				asUser(second.session.token, work)
			const notFound = { code: authErrorCodes.notFound }
			await expect(
				asSecond(() => ProbeUser.revokeSession(other.session.id)),
			).rejects.toMatchObject(notFound)
			await expect(
				asSecond(() =>
					ProbeUser.revokeSession('0199325a-0c00-7000-8000-000000000000'),
				),
			).rejects.toMatchObject(notFound)
			expect(
				(await asUser(other.session.token, () => ProbeUser.current())).id,
			).toBe(other.user.id)

			await expect(
				asSecond(() => ProbeUser.revokeSession(first.session.id)),
			).resolves.toStrictEqual({ revoked: true })
			await expect(
				asUser(first.session.token, () => ProbeUser.current()),
			).rejects.toMatchObject(invalidSession)
			await expect(
				asSecond(() => ProbeUser.revokeSession(first.session.id)),
			).rejects.toMatchObject(notFound)

			// Administration reads and revokes any user, by id, model or pointer.
			const listed = await auth().listSessions(first.user.id)
			expect(listed.map(({ current, id }) => [id, current])).toStrictEqual([
				[second.session.id, false],
			])
			expect(await auth().listSessions(second.user)).toStrictEqual(listed)
			expect(() => auth().listSessions('')).toThrow(
				'auth user must be an id, a model or a pointer',
			)
			await auth().revokeSessions(ProbeUser.pointer(first.user.id))
			expect(await auth().listSessions(first.user.id)).toStrictEqual([])
			await expect(asSecond(() => ProbeUser.current())).rejects.toMatchObject(
				invalidSession,
			)
			expect(await auth().listSessions(other.user.id)).toHaveLength(1)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('ends every session with logoutEverywhere and reports each logout', async () => {
		const events: AuthEvents['afterLogout'][] = []
		const signIns: string[] = []
		const { ProbeUser, asUser, signIn, ultimabase } = await start({
			events: {
				afterLogin: (event) => {
					signIns.push(`login:${event.method}:${String(event.address)}`)
				},
				afterLogout: (event) => {
					events.push(event)
				},
				afterSignUp: (event) => {
					signIns.push(`sign-up:${event.method}:${String(event.address)}`)
				},
			},
		})
		try {
			const first = await signIn('acct|everywhere')
			const second = await signIn('acct|everywhere')
			await asUser(second.session.token, () => ProbeUser.logoutEverywhere())
			for (const { session } of [first, second]) {
				await expect(
					asUser(session.token, () => ProbeUser.current()),
				).rejects.toMatchObject(invalidSession)
			}
			const third = await signIn('acct|everywhere')
			await ProbeUser.logout(third.session.token)
			await vi.waitFor(() => {
				expect(events).toHaveLength(2)
			})
			expect(events).toMatchObject([
				{ everywhere: true, sessionId: null, userId: first.user.id },
				{ everywhere: false, sessionId: third.session.id },
			])
			expect(events[0]?.requestId).toEqual(expect.any(String))
			expect(signIns).toStrictEqual([
				'sign-up:fake:null',
				'login:fake:null',
				'login:fake:null',
			])
		} finally {
			await ultimabase.dispose()
		}
	})
})

describe('session expiry', { concurrent: false }, () => {
	it('refuses a session after its sliding expiry and refreshes lastUsedAt', async () => {
		const now = Date.parse('2026-10-17T10:00:00.000Z')
		vi.useFakeTimers({ now, toFake: ['Date'] })
		const { ProbeUser, asUser, signIn, ultimabase } = await start({
			session: { expiresInMs: 5 * minute },
		})
		try {
			const { session } = await signIn('acct|sliding')
			expect(session.expiresAt).toBe(new Date(now + 5 * minute).toISOString())
			vi.setSystemTime(now + 2 * minute)
			const { sessions } = await asUser(session.token, () =>
				ProbeUser.listSessions(),
			)
			expect(sessions[0]?.lastUsedAt).toBe(
				new Date(now + 2 * minute).toISOString(),
			)
			vi.setSystemTime(now + 5 * minute + 1)
			await expect(
				asUser(session.token, () => ProbeUser.current()),
			).rejects.toMatchObject(invalidSession)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('never extends a session past its absolute expiry', async () => {
		const now = Date.parse('2026-10-17T10:00:00.000Z')
		vi.useFakeTimers({ now, toFake: ['Date'] })
		const { ProbeUser, signIn, ultimabase } = await start({
			session: { absoluteExpiresInMs: day, expiresInMs: day },
		})
		try {
			const { session } = await signIn('acct|absolute')
			vi.setSystemTime(now + 60 * minute)
			const refreshed = await ProbeUser.refresh(session.token)
			expect(refreshed.session.expiresAt).toBe(session.absoluteExpiresAt)
			vi.setSystemTime(now + day)
			await expect(
				ProbeUser.refresh(refreshed.session.token),
			).rejects.toMatchObject(invalidSession)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('rejects malformed, unknown and forged tokens uniformly', async () => {
		const { ProbeUser, asUser, ultimabase } = await start()
		try {
			for (const token of ['', 'nope', `ub_s1.${'a'.repeat(43)}`]) {
				await expect(
					asUser(token, () => ProbeUser.current()),
				).rejects.toMatchObject(invalidSession)
			}
		} finally {
			await ultimabase.dispose()
		}
	})

	it('refuses misused server helpers and foreign User classes', async () => {
		const { asUser, auth, signIn, ultimabase } = await start()
		try {
			const { session } = await signIn('acct|helpers')
			const exports = auth()
			const callUntyped = (name: string, ...args: readonly unknown[]) => {
				const helper: unknown = Reflect.get(exports, name)
				if (typeof helper !== 'function') throw new TypeError(`No ${name}`)
				return Promise.resolve().then((): unknown =>
					Reflect.apply(helper, exports, args),
				)
			}
			await expect(
				callUntyped('runWithSession', session.token, 'handler'),
			).rejects.toThrow('runWithSession handler must be a function')
			await expect(callUntyped('listSessions', 42)).rejects.toThrow(
				'auth user must be an id, a model or a pointer',
			)
			// Another application's User class is not served by this one.
			const OtherUser = UltimaBase.use(
				authPlugin({ methods: [fakeMethod()] }),
			).UserSchema.define({ className: 'OtherUser' })
			await expect(
				asUser(session.token, () => OtherUser.current()),
			).rejects.toThrow('This User schema is not installed in the application')
		} finally {
			await ultimabase.dispose()
		}
	})
})

describe('sensitive operations', { concurrent: false }, () => {
	it('deletes an account only after a recent login, with its sessions and methods', async () => {
		const now = Date.parse('2026-10-17T10:00:00.000Z')
		vi.useFakeTimers({ now, toFake: ['Date'] })
		const { ProbeUser, asUser, run, signIn, ultimabase } = await start({
			session: { recentAuthenticationMs: minute },
		})
		try {
			const { session, user } = await signIn('acct|delete')
			vi.setSystemTime(now + 2 * minute)
			await asUser(session.token, async () => {
				await expect(ProbeUser.deleteAccount()).rejects.toMatchObject({
					code: authErrorCodes.reauthenticationRequired,
				})
				// A new credential proof counts within the same scope.
				await run('reauthenticate')
				await expect(ProbeUser.deleteAccount()).resolves.toStrictEqual({
					deleted: true,
				})
			})
			await expect(
				asUser(session.token, () => ProbeUser.current()),
			).rejects.toMatchObject(invalidSession)
			expect(await ProbeUser.findOne({ where: { id: user.id } })).toBeNull()
			// The linked account went with the user: the same account signs up anew.
			expect((await signIn('acct|delete')).user.id).not.toBe(user.id)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('refuses a credential proof on a revoked session', async () => {
		const { ProbeUser, asUser, run, signIn, ultimabase } = await start()
		try {
			const { session } = await signIn('acct|stale-proof')
			await asUser(session.token, async () => {
				await ProbeUser.logout(session.token)
				await expect(run('reauthenticate')).rejects.toMatchObject(
					invalidSession,
				)
				await expect(run('revoke-others')).rejects.toMatchObject(invalidSession)
			})
		} finally {
			await ultimabase.dispose()
		}
	})

	it('revokes the other sessions on a password change when the policy says so', async () => {
		for (const revokeOnPasswordChange of [true, false]) {
			const { ProbeUser, asUser, run, signIn, ultimabase } = await start({
				session: { revokeOnPasswordChange },
			})
			try {
				const other = await signIn(
					`acct|change-${String(revokeOnPasswordChange)}`,
				)
				const current = await signIn(
					`acct|change-${String(revokeOnPasswordChange)}`,
				)
				await asUser(current.session.token, () => run('revoke-others'))
				const otherRead = asUser(other.session.token, () => ProbeUser.current())
				if (revokeOnPasswordChange) {
					await expect(otherRead).rejects.toMatchObject(invalidSession)
				} else {
					await expect(otherRead).resolves.toMatchObject({
						id: other.user.id,
					})
				}
				// The current session moves to the new generation and stays valid.
				expect(
					(await asUser(current.session.token, () => ProbeUser.current())).id,
				).toBe(current.user.id)
				expect((await ProbeUser.refresh(current.session.token)).user.id).toBe(
					current.user.id,
				)
			} finally {
				await ultimabase.dispose()
			}
		}
	})

	it('revokes every session after a password reset and reports it', async () => {
		const resets: string[] = []
		const { ProbeUser, asUser, run, signIn, ultimabase } = await start({
			events: {
				afterPasswordReset: ({ userId }) => {
					resets.push(userId)
				},
			},
		})
		try {
			const { session, user } = await signIn('acct|reset')
			await run('complete-reset', user.id)
			await expect(
				asUser(session.token, () => ProbeUser.current()),
			).rejects.toMatchObject(invalidSession)
			await vi.waitFor(() => {
				expect(resets).toStrictEqual([user.id])
			})
			const again = await signIn('acct|reset')
			expect(again.user.id).toBe(user.id)
		} finally {
			await ultimabase.dispose()
		}
	})
})
