import type { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { authErrorCodes, type AuthEvents } from '../../src/index.js'
import { fakeLink } from './fake-method.js'
import {
	createProbeApplication,
	type ProbeApplicationOptions,
} from './probe-application.js'
import {
	readProbePath,
	readProbeRecord,
	readProbeString,
	type ProbeScenario,
} from './probe-method.js'

let fixture: PostgresWorkerFixture | undefined
const pool = (): Pool => {
	if (fixture === undefined) throw new TypeError('PostgreSQL is unavailable')
	return fixture.pool
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'auth_users' })
}, 30_000)
afterAll(async () => {
	await fixture?.dispose()
})

const readData = (
	record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => readProbeRecord(record.data ?? {})
const readEmailOption = (record: Readonly<Record<string, unknown>>) =>
	typeof record.email === 'string' ? { email: record.email } : undefined

/** Scenarios standing in for a method's sign-up and email handlers. */
const scenarios: Readonly<Record<string, ProbeScenario>> = {
	'change-email': (services, context, input) => {
		const record = readProbeRecord(input)
		return services.changeEmail({
			context,
			email: readProbeString(record, 'email'),
			method: 'probe',
			userId: readProbeString(record, 'userId'),
		})
	},
	'create-user': (services, context, input) => {
		const record = readProbeRecord(input)
		return services.createUser(
			readData(record),
			context,
			readEmailOption(record),
		)
	},
	inspect: (services, context) =>
		Promise.resolve({
			client: services.client(context) ?? null,
			policy: services.sessionPolicy,
			user: services.user().className,
		}),
	link: (services, _context, input) => {
		const record = readProbeRecord(input)
		return services.linkAccount(readProbeString(record, 'userId'), {
			email: readProbeString(record, 'email'),
			// Omitted, the method vouches for an unverified email.
			...(typeof record.emailVerified === 'boolean'
				? { emailVerified: record.emailVerified }
				: {}),
			method: 'probe',
			providerUserId: readProbeString(record, 'providerUserId'),
		})
	},
	'find-linked': async (services, _context, input) =>
		(await services.findLinkedUser(
			'probe',
			readProbeString(readProbeRecord(input), 'providerUserId'),
		)) ?? null,
	login: (services, context, input) =>
		services.signIn({
			context,
			method: 'probe',
			userId: readProbeString(readProbeRecord(input), 'userId'),
		}),
	'read-user': async (services, _context, input) =>
		(await services.readUser(
			readProbeString(readProbeRecord(input), 'userId'),
		)) ?? null,
	'sign-up-pending': async (services, context, input) => {
		const record = readProbeRecord(input)
		const userId = await services.createUser(
			readData(record),
			context,
			readEmailOption(record),
		)
		return services.signUpPendingVerification({
			context,
			method: 'probe',
			userId,
		})
	},
	'verify-email': (services, context, input) => {
		const record = readProbeRecord(input)
		return services.markEmailVerified({
			context,
			email: readProbeString(record, 'email'),
			userId: readProbeString(record, 'userId'),
		})
	},
}

const start = async (options: ProbeApplicationOptions = {}) => {
	const application = createProbeApplication(pool(), {
		scenarios,
		userEmail: true,
		...options,
	})
	await application.ultimabase.start()
	return application
}

const readSignIn = (value: unknown): { session: { token: string } } => {
	const session = readProbeRecord(readProbeRecord(value).session)
	return { session: { token: readProbeString(session, 'token') } }
}

const readId = (value: unknown): string => {
	if (typeof value !== 'string') throw new TypeError('No user id')
	return value
}

describe('users created by methods', { concurrent: false }, () => {
	it('creates users with an unverified email and refuses taken or invalid data', async () => {
		const { ProbeUser, auth, run, ultimabase } = await start()
		try {
			const ada = readId(
				await run('create-user', {
					data: { nickname: 'Ada' },
					email: 'ada@example.test',
				}),
			)
			expect(await run('read-user', { userId: ada })).toMatchObject({
				email: 'ada@example.test',
				emailVerified: false,
				emailVerifiedAt: null,
				id: ada,
				nickname: 'Ada',
			})
			expect(
				await run('read-user', {
					userId: '0199325a-0c00-7000-8000-000000000000',
				}),
			).toBeNull()
			// A taken email is refused without naming it.
			const taken = run('create-user', { email: 'ada@example.test' })
			await expect(taken).rejects.toMatchObject({
				code: authErrorCodes.signUpRejected,
				publicMessage: 'Sign-up was rejected.',
			})
			await expect(taken).rejects.not.toHaveProperty('publicDetails.fields')
			await expect(
				run('create-user', { data: { nickname: 42 } }),
			).rejects.toMatchObject({
				code: authErrorCodes.signUpRejected,
				publicDetails: { fields: ['nickname'] },
				publicMessage: 'Sign-up was rejected: check nickname.',
			})

			// Administration creates Users in one transaction, with the same rules.
			const bob = await auth().createUser({
				data: { nickname: 'Bob' },
				email: 'bob@example.test',
			})
			expect(await run('read-user', { userId: bob })).toMatchObject({
				email: 'bob@example.test',
				emailVerified: false,
			})
			const carol = await auth().createUser({ data: {} })
			expect(await run('read-user', { userId: carol })).toMatchObject({
				email: null,
			})
			const createUser: unknown = Reflect.get(auth(), 'createUser')
			if (typeof createUser !== 'function') throw new TypeError('No createUser')
			expect(() => {
				Reflect.apply(createUser, undefined, [{ data: 'Dan' }])
			}).toThrow('auth.createUser takes { data, email? }')

			// The generic create is closed: only the flows set the email (ADR-0341).
			await expect(
				ProbeUser.createOne({ data: { nickname: 'Eve' } }),
			).rejects.toThrow('Users are created by sign-up')
		} finally {
			await ultimabase.dispose()
		}
	})

	it('completes a sign-up without a session while the email waits', async () => {
		const signUps: AuthEvents['afterSignUp'][] = []
		const { run, ultimabase } = await start({
			events: {
				afterSignUp: (event) => {
					signUps.push(event)
				},
			},
		})
		try {
			const pending = await run('sign-up-pending', {
				data: { nickname: 'Pat' },
				email: 'pat@example.test',
			})
			expect(pending).toMatchObject({
				user: { email: 'pat@example.test', nickname: 'Pat' },
				verificationRequired: true,
			})
			expect(JSON.stringify(pending)).not.toContain('ub_s1.')
			await vi.waitFor(() => {
				expect(signUps).toHaveLength(1)
			})
			expect(signUps[0]).toMatchObject({
				address: null,
				method: 'probe',
				sessionId: null,
			})
		} finally {
			await ultimabase.dispose()
		}
	})

	it('gives methods the policy, the User and the HTTP client', async () => {
		const { run, ultimabase } = await start({
			session: { recentAuthenticationMs: 120_000 },
		})
		try {
			expect(await run('inspect')).toMatchObject({
				client: null,
				policy: { recentAuthenticationMs: 120_000 },
				user: 'ProbeUser',
			})
		} finally {
			await ultimabase.dispose()
		}
	})
})

describe('email verification and change', { concurrent: false }, () => {
	it('verifies the current email once, with its linked accounts', async () => {
		const verified: AuthEvents['afterEmailVerified'][] = []
		const { ProbeUser, asUser, run, ultimabase } = await start({
			events: {
				afterEmailVerified: (event) => {
					verified.push(event)
				},
			},
		})
		try {
			const userId = readId(
				await run('create-user', { email: 'vera@example.test' }),
			)
			await run('link', {
				email: 'vera@example.test',
				providerUserId: 'probe|vera',
				userId,
			})
			const verify = (email: string) => run('verify-email', { email, userId })
			expect(await verify('other@example.test')).toBe(false)
			expect(await verify('vera@example.test')).toBe(true)
			expect(await verify('vera@example.test')).toBe(false)
			const verifiedUser = await run('read-user', { userId })
			expect(verifiedUser).toMatchObject({ emailVerified: true })
			expect(typeof readProbePath(verifiedUser, 'emailVerifiedAt')).toBe(
				'string',
			)
			const { session } = readSignIn(await run('login', { userId }))
			const { methods } = await asUser(session.token, () =>
				ProbeUser.listMethods(),
			)
			expect(methods).toMatchObject([
				{ email: 'vera@example.test', emailVerified: true, method: 'probe' },
			])
			await vi.waitFor(() => {
				expect(verified).toHaveLength(1)
			})
			expect(verified[0]).toMatchObject({ email: 'vera@example.test', userId })
		} finally {
			await ultimabase.dispose()
		}
	})

	it('moves the email, its linked account and automatic linking to the new address', async () => {
		const changes: AuthEvents['afterEmailChanged'][] = []
		const { run, signIn, ultimabase } = await start({
			events: {
				afterEmailChanged: (event) => {
					changes.push(event)
				},
			},
		})
		try {
			const userId = readId(
				await run('create-user', { email: 'old@example.test' }),
			)
			await run('link', {
				email: 'old@example.test',
				emailVerified: true,
				providerUserId: 'probe|mover',
				userId,
			})
			expect(
				await run('change-email', { email: 'new@example.test', userId }),
			).toBe('old@example.test')
			expect(await run('read-user', { userId })).toMatchObject({
				email: 'new@example.test',
				emailVerified: true,
			})
			expect(await run('find-linked', { providerUserId: 'probe|mover' })).toBe(
				userId,
			)
			expect(
				await run('find-linked', { providerUserId: 'probe|nobody' }),
			).toBeNull()
			// The new verified email links; the released one belongs to nobody.
			expect((await signIn('acct|new', 'new@example.test')).user.id).toBe(
				userId,
			)
			expect((await signIn('acct|old', 'old@example.test')).user.id).not.toBe(
				userId,
			)
			await vi.waitFor(() => {
				expect(changes).toHaveLength(1)
			})
			expect(changes[0]).toMatchObject({
				email: 'new@example.test',
				previousEmail: 'old@example.test',
				userId,
			})

			// A user without an email has nothing to change.
			const { user } = await signIn('acct|no-email')
			await expect(
				run('change-email', { email: 'x@example.test', userId: user.id }),
			).rejects.toMatchObject({ code: authErrorCodes.invalidSession })
		} finally {
			await ultimabase.dispose()
		}
	})

	it('refuses refresh to unverified users when the method requires verification', async () => {
		const { ProbeUser, run, ultimabase } = await start({
			requireVerifiedEmail: true,
		})
		try {
			const userId = readId(
				await run('create-user', { email: 'una@example.test' }),
			)
			const { session } = readSignIn(await run('login', { userId }))
			await expect(ProbeUser.refresh(session.token)).rejects.toMatchObject({
				code: authErrorCodes.emailNotVerified,
			})
			await run('verify-email', { email: 'una@example.test', userId })
			expect((await ProbeUser.refresh(session.token)).user.id).toBe(userId)
		} finally {
			await ultimabase.dispose()
		}
	})
})

describe('linked methods', { concurrent: false }, () => {
	it('lets the unlinked method delete its secrets', async () => {
		const unlinked: string[] = []
		const { ProbeUser, asUser, run, signIn, ultimabase } = await start({
			onUnlink: (userId) => {
				unlinked.push(userId)
			},
			userEmail: false,
		})
		try {
			const { session, user } = await signIn('acct|unlink')
			const linked = await asUser(session.token, () =>
				ultimabase.operation(fakeLink).execute({
					email: null,
					emailVerified: false,
					providerUserId: 'acct|unlink-2',
				}),
			)
			const probe = await run('link', {
				email: 'unlink@example.test',
				providerUserId: 'probe|unlink',
				userId: user.id,
			})
			const probeId = readProbeString(readProbeRecord(probe), 'id')
			await asUser(session.token, async () => {
				await ProbeUser.unlinkMethod(linked.id)
				expect(unlinked).toStrictEqual([])
				await ProbeUser.unlinkMethod(probeId)
			})
			expect(unlinked).toStrictEqual([user.id])
			expect(
				await ProbeUser.runProbe('find-linked', {
					providerUserId: 'probe|unlink',
				}),
			).toBeNull()
		} finally {
			await ultimabase.dispose()
		}
	})
})
